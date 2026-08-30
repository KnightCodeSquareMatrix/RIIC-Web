import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";
import { URL } from "node:url";

const repoRoot = new URL("../", import.meta.url);

async function readRepoFile(relativePath) {
  return readFile(new URL(relativePath, repoRoot), "utf8");
}

test("Next.js commands use the default Turbopack bundler", async () => {
  const packageJson = JSON.parse(await readRepoFile("package.json"));
  const playwrightConfig = await readRepoFile("playwright.config.ts");
  const productionPlaywrightConfig = await readRepoFile("playwright.production.config.ts");

  assert.equal(packageJson.scripts.build, "next build");
  assert.doesNotMatch(packageJson.scripts.dev, /--webpack\b/);
  assert.doesNotMatch(playwrightConfig, /--webpack\b/);
  assert.doesNotMatch(productionPlaywrightConfig, /--webpack\b/);
});

test("production builds prepare a solver-free standalone runtime with static assets", async () => {
  const packageJson = JSON.parse(await readRepoFile("package.json"));
  const nextConfig = await readRepoFile("next.config.ts");
  const prepareStandalone = await readRepoFile("scripts/prepare-standalone.mjs");
  const startStandalone = await readRepoFile("scripts/start-standalone.mjs");
  const stageStandalone = await readRepoFile("scripts/stage-standalone-release.mjs");

  assert.match(nextConfig, /output: "standalone"/);
  assert.equal(packageJson.scripts.postbuild, "node scripts/prepare-standalone.mjs");
  assert.equal(packageJson.scripts.start, "node scripts/start-standalone.mjs");
  assert.equal(packageJson.scripts["release:stage"], "node scripts/stage-standalone-release.mjs");
  assert.match(prepareStandalone, /standaloneRoot, "public"/);
  assert.match(prepareStandalone, /standaloneRoot, "\.next", "static"/);
  assert.match(prepareStandalone, /\["infra-cli", "infra-cli\.exe"\]/);
  assert.match(prepareStandalone, /\["\.env", "\.env\.production", "\.env\.local", "\.env\.production\.local"\]/);
  assert.match(prepareStandalone, /standalone website output must not contain/);
  assert.match(prepareStandalone, /node_modules\/drizzle-orm/);
  assert.match(prepareStandalone, /scripts\/backfill-business-data\.mts/);
  assert.match(prepareStandalone, /scripts\/migrate-db\.mts/);
  assert.match(prepareStandalone, /scripts\/check-auth-readiness\.mts/);
  assert.match(prepareStandalone, /src\/server\/business-backfill\.ts/);
  assert.match(startStandalone, /ARKNIGHTS_INFRA_HOSTNAME \|\| "0\.0\.0\.0"/);
  assert.match(startStandalone, /process\.env\.PORT = String\(numericPort\)/);
  assert.match(startStandalone, /\.next\/standalone\/server\.js/);
  assert.match(stageStandalone, /kind: "riic-web-standalone"/);
  assert.match(stageStandalone, /standalone release root must not contain/);
  assert.match(stageStandalone, /\["bin\/infra-cli", "infra-cli"\]/);
  assert.match(stageStandalone, /\["\.env\.production\.local", "\.env\.production\.local"\]/);
  assert.match(stageStandalone, /dereference: true/);
});

test("CI enforces route and document preload JavaScript budgets after building", async () => {
  const packageJson = JSON.parse(await readRepoFile("package.json"));
  const workflow = await readRepoFile(".github/workflows/frontend-quality.yml");
  const budgetCheck = await readRepoFile("scripts/check-bundle-budget.mjs");

  assert.equal(packageJson.scripts["check:bundle-budget"], "node scripts/check-bundle-budget.mjs");
  assert.match(workflow, /Production build[\s\S]+npm run check:bundle-budget/);
  assert.match(budgetCheck, /MAX_SKLAND_DISABLED_ROUTE_INITIAL_JS_BYTES = 1_130_000/);
  assert.match(budgetCheck, /MAX_SKLAND_ENABLED_ROUTE_INITIAL_JS_BYTES = 1_150_000/);
  assert.match(budgetCheck, /MAX_SKLAND_ROUTE_INITIAL_JS_BYTES = 1_590_000/);
  assert.match(budgetCheck, /MAX_SKLAND_DISABLED_DOCUMENT_INITIAL_JS_BYTES = 1_240_000/);
  assert.match(budgetCheck, /MAX_SKLAND_ENABLED_DOCUMENT_INITIAL_JS_BYTES = 1_270_000/);
  assert.match(budgetCheck, /MAX_SKLAND_DISABLED_DOCUMENT_INITIAL_GZIP_JS_BYTES = 395_000/);
  assert.match(budgetCheck, /MAX_SKLAND_ENABLED_DOCUMENT_INITIAL_GZIP_JS_BYTES = 405_000/);
  assert.match(budgetCheck, /const sklandEnabled = sklandRoute\.firstLoadChunkPaths\.some/);
  assert.match(budgetCheck, /MAX_SECONDARY_ROUTE_INITIAL_JS_BYTES = 1_525_000/);
  assert.match(budgetCheck, /MAX_DOCUMENT_INITIAL_JS_FILES = 18/);
  assert.match(budgetCheck, /WORKBENCH_ROUTES = \["\/", "\/training", "\/skills", "\/skland", "\/account"\]/);
  assert.match(budgetCheck, /firstLoadUncompressedJsBytes/);
  assert.match(budgetCheck, /\.next\/server\/app\/index\.html/);
  assert.match(budgetCheck, /gzipSync/);
  assert.match(budgetCheck, /COMPACT_SCHEDULE_MARKER = "data-compact-schedule-view"/);
  assert.match(budgetCheck, /compact schedule code leaked into the initially loaded application chunk/);
});

test("Next and the verified deployment keep real public GET responses compressed", async () => {
  const nextConfig = await readRepoFile("next.config.ts");
  const deployWorkflow = await readRepoFile(".github/workflows/deploy.yml");

  assert.match(nextConfig, /compress: true/);
  assert.match(deployWorkflow, /Deploy and verify[\s\S]+Verify public response compression/);
  assert.match(deployWorkflow, /node scripts\/verify-public-compression\.mjs\s*$/m);
  assert.doesNotMatch(deployWorkflow, /verify-public-compression\.mjs "\$DEPLOY_PUBLIC_HEALTH_URL"/);
});

test("CI gates releases on Chromium and schedules the full WebKit suite", async () => {
  const workflow = await readRepoFile(".github/workflows/frontend-quality.yml");
  const playwrightConfig = await readRepoFile("playwright.config.ts");
  const e2eFiles = await readdir(new URL("../e2e/", import.meta.url));
  const readinessSpecs = e2eFiles.filter((file) => /^production-readiness-.+\.spec\.ts$/.test(file));
  const readinessTestCount = (await Promise.all(readinessSpecs.map((file) => readRepoFile(`e2e/${file}`))))
    .reduce((count, source) => count + (source.match(/^test\(/gm)?.length ?? 0), 0);

  assert.match(workflow, /browser_e2e:[\s\S]+npm run test:e2e[\s\S]+npm run test:e2e:production-profile/);
  assert.match(workflow, /webkit_e2e:[\s\S]+github\.event_name == 'schedule'[\s\S]+npm run test:e2e:webkit/);
  assert.match(workflow, /quality:[\s\S]+needs: \[pull_request_policy, changes, repository_hygiene, checks, browser_e2e\]/);
  assert.doesNotMatch(workflow, /quality:[\s\S]+needs: \[[^\]]*webkit_e2e/);
  assert.match(workflow, /deploy:[\s\S]+needs: \[changes, quality\]/);
  assert.match(workflow, /cancel-in-progress: \$\{\{ github\.event_name == 'pull_request' \}\}/);
  assert.equal(readinessSpecs.length, 4);
  assert.equal(readinessTestCount, 77);
  assert.equal(e2eFiles.includes("production-readiness.spec.ts"), false);
  assert.match(playwrightConfig, /fullyParallel: false/);
  assert.match(playwrightConfig, /workers: process\.env\.CI \? 3 : undefined/);
  assert.match(playwrightConfig, /timeout: process\.env\.CI \? 10_000 : 5_000/);
});

test("CI change scope keeps one required quality gate and fails closed", async () => {
  const workflow = await readRepoFile(".github/workflows/frontend-quality.yml");
  const classifier = await readRepoFile("scripts/ci-change-scope.mjs");

  assert.doesNotMatch(workflow, /paths-ignore:/);
  assert.match(workflow, /changes:[\s\S]+name: Change scope/);
  assert.match(workflow, /repository_hygiene:[\s\S]+npm run check:public-repository/);
  assert.match(workflow, /fetch-depth: 0/);
  assert.match(workflow, /node scripts\/ci-change-scope\.mjs/);
  assert.match(workflow, /git diff --name-only -z "\$PR_BASE_SHA\.\.\.\$PR_HEAD_SHA"/);
  assert.match(workflow, /git diff --name-only -z "\$PUSH_BEFORE_SHA\.\.\$HEAD_SHA"/);
  assert.match(workflow, /"\$\{classifier\[@\]\}" --force-full/);
  assert.match(workflow, /checks:[\s\S]+needs: changes[\s\S]+needs\.changes\.outputs\.run_core == 'true'/);
  assert.match(workflow, /browser_e2e:[\s\S]+needs: changes[\s\S]+needs\.changes\.outputs\.run_browser == 'true'/);
  assert.match(workflow, /quality:[\s\S]+test "\$CHANGES_RESULT" = "success"[\s\S]+test "\$HYGIENE_RESULT" = "success"[\s\S]+"\$DEPLOY_REQUIRED" == "true"[\s\S]+"\$required" == "true"[\s\S]+verify_result "\$RUN_CORE"[\s\S]+verify_result "\$RUN_BROWSER"/);
  assert.match(workflow, /deploy:[\s\S]+needs\.changes\.outputs\.deploy_required == 'true'/);

  assert.match(classifier, /fullScope\(paths, "empty-change-set"\)/);
  assert.match(classifier, /fullScope\(paths, "runtime-or-unclassified-change"\)/);
  assert.match(classifier, /runCore: true,[\s\S]+runBrowser: true,[\s\S]+deployRequired: true/);
});

test("public deployment automation is repository-bound, opt-in, and secret-safe", async () => {
  const qualityWorkflow = await readRepoFile(".github/workflows/frontend-quality.yml");
  const deployWorkflow = await readRepoFile(".github/workflows/deploy.yml");
  const preflightWorkflow = await readRepoFile(".github/workflows/deployment-preflight.yml");
  const assetWorkflow = await readRepoFile(".github/workflows/sync-arkntools-assets.yml");
  const workflows = [qualityWorkflow, deployWorkflow, preflightWorkflow, assetWorkflow];
  const deployJobEnvironment = deployWorkflow.slice(
    deployWorkflow.indexOf("    env:"),
    deployWorkflow.indexOf("    steps:"),
  );

  assert.match(qualityWorkflow, /HEAD_REPOSITORY[\s\S]+EXPECTED_REPOSITORY: KnightCodeSquareMatrix\/RIIC-Web[\s\S]+"\$HEAD_REF" == release\/\*/);
  assert.match(qualityWorkflow, /git merge-base --is-ancestor "\$HEAD_SHA" refs\/remotes\/origin\/develop/);
  assert.match(qualityWorkflow, /github\.event_name == 'push'[\s\S]+needs\.quality\.result == 'success'[\s\S]+needs\.changes\.outputs\.deploy_required == 'true'[\s\S]+vars\.DEPLOY_AUTOMATION_ENABLED == '1'[\s\S]+github\.repository == 'KnightCodeSquareMatrix\/RIIC-Web'/);
  assert.match(deployWorkflow, /github\.event_name == 'push'[\s\S]+vars\.DEPLOY_AUTOMATION_ENABLED == '1'[\s\S]+github\.repository == 'KnightCodeSquareMatrix\/RIIC-Web'/);
  assert.match(deployWorkflow, /DEPLOY_APPROVED_SOLVER_SHA256: \$\{\{ vars\.DEPLOY_APPROVED_SOLVER_SHA256 \}\}[\s\S]+DEPLOY_EXPECTED_REPOSITORY: KnightCodeSquareMatrix\/RIIC-Web[\s\S]+DEPLOY_RELEASE_HELPER_CONTRACT: "4"/);
  assert.doesNotMatch(deployWorkflow, /DEPLOY_PREPARE_HELPER_CONTRACT|arknights-infra-prepare-release/);
  assert.match(deployWorkflow, /DEPLOY_PUBLIC_HEALTH_URL: \$\{\{ secrets\.DEPLOY_PUBLIC_HEALTH_URL \}\}/);
  assert.doesNotMatch(deployWorkflow, /DEPLOY_PUBLIC_HEALTH_URL: \$\{\{ vars\./);
  assert.doesNotMatch(deployJobEnvironment, /\$\{\{ secrets\./);
  assert.match(preflightWorkflow, /Preflight is read-only: no archive, release directory, symlink switch, or service restart was requested/);
  assert.match(preflightWorkflow, /mode:[\s\S]+baseline[\s\S]+cutover-ready/);
  assert.match(preflightWorkflow, /PREFLIGHT_MODE: \$\{\{ inputs\.mode \}\}/);
  assert.match(preflightWorkflow, /DEPLOY_ENVIRONMENT: \$\{\{ inputs\.environment \}\}/);
  assert.match(preflightWorkflow, /if \[\[ "\$PREFLIGHT_MODE" == "cutover-ready" \]\][\s\S]+test "\$actual_contract" = "\$expected_contract"/);
  assert.match(preflightWorkflow, /DEPLOY_APPROVED_SOLVER_SHA256: \$\{\{ vars\.DEPLOY_APPROVED_SOLVER_SHA256 \}\}[\s\S]+DEPLOY_RELEASE_HELPER_CONTRACT: "4"/);
  assert.match(preflightWorkflow, /Inspect deploy helper, solver, and disk[\s\S]+verify_helper deploy \/usr\/local\/sbin\/arknights-infra-deploy/);
  assert.match(preflightWorkflow, /sudo -n \/usr\/local\/sbin\/arknights-infra-deploy[\s\S]+--preflight "\$deployment_environment" "\$app_root"[\s\S]+"\$expected_repository" "\$approved_solver_sha256"/);
  assert.match(preflightWorkflow, /solver_source=not-inspected-root-only/);
  assert.doesNotMatch(preflightWorkflow, /DEPLOY_PREPARE_HELPER_CONTRACT|arknights-infra-prepare-release|cache_repository|expected_origin|public_cache_ready|cache_public_origin_ready|repository\.git|git --git-dir/);
  assert.doesNotMatch(preflightWorkflow, /current_release\/\.env\.production\.local|current_release="\$\(readlink/);
  assert.match(deployWorkflow, /printf '%s\\n' "\$DEPLOY_PUBLIC_HEALTH_URL" \| ssh[\s\S]+'\$public_health_argument'/);
  assert.match(deployWorkflow, /'\$DEPLOY_EXPECTED_REPOSITORY'[\s\S]+'\$DEPLOY_APPROVED_SOLVER_SHA256'[\s\S]+'\$DEPLOY_TREE_SHA'/);
  assert.doesNotMatch(deployWorkflow, /'\$DEPLOY_PUBLIC_HEALTH_URL'/);
  assert.match(deployWorkflow, /Remove SSH credentials from the runner[\s\S]+rm -f -- "\$HOME\/\.ssh\/id_ed25519" "\$HOME\/\.ssh\/known_hosts"/);
  assert.match(deployWorkflow, /Verify public response compression[\s\S]+DEPLOY_PUBLIC_HEALTH_URL: \$\{\{ secrets\.DEPLOY_PUBLIC_HEALTH_URL \}\}[\s\S]+node scripts\/verify-public-compression\.mjs/);
  assert.match(assetWorkflow, /BASE_BRANCH: develop/);
  assert.match(assetWorkflow, /gh pr (?:list|create)[\s\S]+--base "\$BASE_BRANCH"/);

  for (const workflow of workflows) {
    assert.doesNotMatch(workflow, /^\s*pull_request_target\s*:/m);
    for (const match of workflow.matchAll(/^\s*-?\s*uses:\s*([^\s#]+)/gm)) {
      assert.ok(match[1].startsWith("./") || /@[0-9a-f]{40}$/.test(match[1]));
    }
  }
});

test("deploy builds and transfers a verified solver-free standalone artifact", async () => {
  const deployWorkflow = await readRepoFile(".github/workflows/deploy.yml");

  assert.match(deployWorkflow, /Use Node\.js 22[\s\S]+actions\/setup-node@[0-9a-f]{40}[\s\S]+node-version: 22/);
  assert.match(deployWorkflow, /Resolve verified release identity[\s\S]+git rev-parse 'HEAD\^\{tree\}'[\s\S]+DEPLOY_TREE_SHA=%s/);
  assert.match(deployWorkflow, /Validate deployment configuration[\s\S]+\[\[ "\$DEPLOY_TREE_SHA" =~ \^\[0-9a-f\]\{40\}\$ \]\]/);
  assert.match(deployWorkflow, /Install verified build dependencies[\s\S]+run: npm ci/);
  assert.match(deployWorkflow, /Build standalone release[\s\S]+APP_DEPLOYMENT_ENV:[\s\S]+SKLAND_FEATURE_ENABLED: "1"[\s\S]+ACCOUNT_CLOUD_SYNC_ENABLED: "1"[\s\S]+run: npm run build/);
  assert.match(deployWorkflow, /RELEASE_SHA="\$DEPLOY_SHA" RELEASE_TREE_SHA="\$DEPLOY_TREE_SHA"[\s\S]+npm run release:stage -- --output "\$artifact_root"/);
  assert.match(deployWorkflow, /tar -czf "\$local_archive" -C "\$artifact_root" \.[\s\S]+gzip -t "\$local_archive"/);
  assert.match(deployWorkflow, /archive_sha256="\$\(sha256sum "\$local_archive"[\s\S]+DEPLOY_ARCHIVE_SHA256=%s/);
  assert.match(deployWorkflow, /Upload standalone release archive[\s\S]+scp "\$\{ssh_options\[@\]\}"[\s\S]+"\$DEPLOY_LOCAL_ARCHIVE"[\s\S]+test "\$remote_sha256" = "\$DEPLOY_ARCHIVE_SHA256"/);
  assert.match(deployWorkflow, /DEPLOY_RELEASE_HELPER_CONTRACT: "4"/);
  assert.match(deployWorkflow, /'\$DEPLOY_APPROVED_SOLVER_SHA256' \\\n\s+'\$DEPLOY_TREE_SHA'/);
  assert.match(deployWorkflow, /Remove staged release artifacts from the runner[\s\S]+if: always\(\)[\s\S]+"\$RUNNER_TEMP"\/riic-web-release\.\*[\s\S]+"\$RUNNER_TEMP"\/arknights-infra-\*\.tar\.gz/);
  assert.doesNotMatch(deployWorkflow, /git (?:archive|bundle)|repository\.git|DEPLOY_PREVIOUS_SHA|remote_bundle|bin\/infra-cli/);
});

test("asset synchronization isolates untrusted generation from repository write credentials", async () => {
  const workflow = await readRepoFile(".github/workflows/sync-arkntools-assets.yml");
  const generate = workflow.slice(workflow.indexOf("  generate:"), workflow.indexOf("  publish:"));
  const publish = workflow.slice(workflow.indexOf("  publish:"));

  assert.match(workflow, /^permissions:\n {2}contents: read$/m);
  assert.match(generate, /persist-credentials: false/);
  assert.doesNotMatch(generate, /contents: write|pull-requests: write|actions: write|GH_TOKEN:/);
  assert.match(generate, /actions\/upload-artifact@[0-9a-f]{40}/);
  assert.match(publish, /permissions:\n {6}actions: write\n {6}contents: write\n {6}pull-requests: write/);
  assert.match(publish, /GH_TOKEN: \$\{\{ github\.token \}\}/);
  assert.match(publish, /actions\/download-artifact@[0-9a-f]{40}/);
  assert.match(publish, /git apply --check --index "\$publication\/managed\.patch"/);
  assert.match(publish, /patch_bytes > 0 && patch_bytes <= 104857600/);
  assert.match(publish, /awk '\$1 != "100644"/);
  assert.match(publish, /Publication artifact changed a forbidden path/);
  assert.doesNotMatch(publish, /npm (?:ci|run)|node scripts\//);
});

test("CI browser jobs use the matching pinned Playwright image without runtime apt installs", async () => {
  const packageLock = JSON.parse(await readRepoFile("package-lock.json"));
  const workflow = await readRepoFile(".github/workflows/frontend-quality.yml");
  const playwrightVersion = packageLock.packages["node_modules/@playwright/test"].version;
  const escapedVersion = playwrightVersion.replaceAll(".", "\\.");
  const pinnedImage = new RegExp(`image: mcr\\.microsoft\\.com/playwright:v${escapedVersion}-noble@sha256:[a-f0-9]{64}`, "g");
  const browserJobs = workflow.slice(workflow.indexOf("  browser_e2e:"), workflow.indexOf("  quality:"));

  assert.equal(workflow.match(pinnedImage)?.length, 2);
  assert.equal(browserJobs.match(/@postgres:5432\/arknights_auth_test/g)?.length, 6);
  assert.doesNotMatch(browserJobs, /playwright install(?:-deps)?/);
  assert.doesNotMatch(browserJobs, /Initialize limited database roles/);
  assert.equal(browserJobs.match(/options: --user 1001/g)?.length, 2);
});

test("production injects the client feature flag at every browser boundary", async () => {
  const nextConfig = await readRepoFile("next.config.ts");
  const app = await readRepoFile("src/App.tsx");
  const sklandPage = await readRepoFile("src/app/(workbench)/skland/page.tsx");
  const developmentSklandCenter = await readRepoFile("src/components/pages/DevelopmentSklandStatusCenter.tsx");
  const setupDialog = await readRepoFile("src/setup-dialog.tsx");
  const workflow = await readRepoFile(".github/workflows/frontend-quality.yml");

  assert.match(nextConfig, /APP_CLIENT_SKLAND_ENABLED: isSklandFeatureEnabled\(\) \? "1" : "0"/);
  assert.match(nextConfig, /APP_CLIENT_SKLAND_API_PREFIX: isSklandFeatureEnabled\(\) \? "\/api\/skland" : ""/);
  assert.match(nextConfig, /"account-cloud-workspace-bridge": process\.env\.ACCOUNT_CLOUD_SYNC_ENABLED === "1"/);
  assert.match(nextConfig, /useAccountCloudWorkspace\.disabled\.ts/);
  assert.match(nextConfig, /"workbench-skland-route": isSklandFeatureEnabled\(\)/);
  assert.match(nextConfig, /SklandRoute\.disabled\.tsx/);
  assert.match(app, /process\.env\.APP_CLIENT_SKLAND_ENABLED === "1"/);
  assert.match(sklandPage, /process\.env\.APP_CLIENT_SKLAND_ENABLED !== "1"/);
  assert.match(setupDialog, /process\.env\.APP_CLIENT_SKLAND_ENABLED === "1"/);
  assert.match(developmentSklandCenter, /SklandStatus/);
  assert.match(workflow, /Production build[\s\S]+APP_DEPLOYMENT_ENV: production[\s\S]+SKLAND_FEATURE_ENABLED: "1"/);
  assert.match(workflow, /Production client feature boundary[\s\S]+APP_DEPLOYMENT_ENV: production[\s\S]+SKLAND_FEATURE_ENABLED: "1"/);
});

test("workbench views use five prefetched route entries under one persistent layout", async () => {
  const layout = await readRepoFile("src/app/(workbench)/layout.tsx");
  const app = await readRepoFile("src/App.tsx");
  const sidebar = await readRepoFile("src/components/layout/AppSidebar.tsx");
  const routeMap = await readRepoFile("src/workbench-routes.ts");
  const pages = await Promise.all([
    "src/app/(workbench)/page.tsx",
    "src/app/(workbench)/training/page.tsx",
    "src/app/(workbench)/skills/page.tsx",
    "src/app/(workbench)/skland/page.tsx",
    "src/app/(workbench)/account/page.tsx",
  ].map(readRepoFile));
  const loadingPages = await Promise.all([
    "src/app/(workbench)/training/loading.tsx",
    "src/app/(workbench)/skills/loading.tsx",
    "src/app/(workbench)/account/loading.tsx",
  ].map(readRepoFile));

  assert.match(layout, /import WorkbenchApp from "@\/App"/);
  assert.match(layout, /<WorkbenchApp>\{children\}<\/WorkbenchApp>/);
  assert.ok(pages.every((page) => !page.includes("dynamic(")));
  assert.ok(loadingPages.every((loadingPage) => loadingPage.includes("RouteSkeleton")));
  assert.doesNotMatch(app, /components\/pages\/(?:InfraCalculator|TrainingAdvice|SkillQuery|AccountStatusCenter|DevelopmentSklandStatusCenter)/);
  assert.match(routeMap, /training: "\/training"/);
  assert.match(routeMap, /"skill-query": "\/skills"/);
  assert.match(routeMap, /skland: "\/skland"/);
  assert.match(routeMap, /account: "\/account"/);
  assert.match(sidebar, /import Link from "next\/link"/);
  assert.doesNotMatch(sidebar, /useLinkStatus|data-navigation-pending/);
  assert.match(sidebar, /data-primary-navigation-prefetch="eager"/);
  assert.doesNotMatch(sidebar, /prefetch=\{false\}/);
  assert.match(app, /router\.prefetch\(workbenchHref\(target\)\)/);
  assert.doesNotMatch(app, /betaRequested|showBetaPanels|DebugActions|IssuePanel/);
  assert.doesNotMatch(routeMap, /\?beta|betaRequested/);
  assert.doesNotMatch(sidebar, /\?beta|betaRequested/);
});

test("the critical calculator board stays initial while the compact view loads on demand", async () => {
  const calculator = await readRepoFile("src/components/pages/InfraCalculator.tsx");
  const calculatorRoute = await readRepoFile("src/components/workbench/CalculatorRoute.tsx");
  const lazyLoader = await readRepoFile("src/client-lazy-loader.ts");
  const app = await readRepoFile("src/App.tsx");

  assert.match(calculator, /import \{ ScheduleBoard, ShiftTabs \} from "@\/components"/);
  assert.doesNotMatch(calculator, /const (?:ScheduleBoard|ShiftTabs) = lazy\(/);
  assert.doesNotMatch(calculator, /const (?:ScheduleBoard|ShiftTabs) = dynamic\(/);
  assert.doesNotMatch(calculator, /<Suspense fallback=\{<DeferredResultLoading \/>\}><ScheduleBoard/);
  assert.match(calculatorRoute, /import \{ InfraCalculator \} from "@\/components\/pages\/InfraCalculator"/);
  assert.doesNotMatch(app, /PageScrollbar/);
  const components = await readRepoFile("src/components.tsx");
  assert.match(components, /useState<ScheduleViewMode \| null>\(null\)/);
  assert.match(components, /useState<boolean \| null>\(null\)/);
  assert.match(components, /window\.matchMedia\("\(min-width: 1024px\)"\)/);
  assert.match(components, /viewMode !== "compact"[\s\S]{0,300}loadClientFeature\("compactScheduleView"\)/);
  assert.match(lazyLoader, /case "compactScheduleView":[\s\S]{0,100}import\("@\/components\/CompactScheduleView"\)/);
  assert.doesNotMatch(components, /import \{ CompactScheduleView \} from "@\/components\/CompactScheduleView"/);
  assert.doesNotMatch(calculator, /onViewModeChange|showBetaSidebar|showBetaPanels/);
  assert.match(app, /const hasRenderedCalculator = useRef\(false\)/);
  assert.match(calculator, /animateInitialView=\{!scheduleResult && animateEmptyScheduleEntrance\}/);
  assert.doesNotMatch(calculator, /animateInitialView=\{!scheduleResult\}/);
});

test("heavy account, operator, and scrollbar modules stay behind runtime boundaries", async () => {
  const app = await readRepoFile("src/App.tsx");
  const schedule = await readRepoFile("src/schedule.ts");
  const components = await readRepoFile("src/components.tsx");
  const scrollbar = await readRepoFile("src/components/ui/page-scrollbar.tsx");

  assert.match(app, /useWebsiteSession/);
  assert.doesNotMatch(app, /authClient\.useSession/);
  assert.doesNotMatch(schedule, /operatorPresentationFor/);
  assert.doesNotMatch(components, /from "@\/operatorPortraits"/);
  assert.match(scrollbar, /import\("overlayscrollbars"\)/);
});

test("versioned product assets receive immutable cache headers", async () => {
  const nextConfig = await readRepoFile("next.config.ts");

  assert.match(nextConfig, /source: "\/images\/products\/:asset"/);
  assert.match(nextConfig, /key: "v", value: "\\\\d\+-\[0-9a-f\]\{12\}"/);
  assert.match(nextConfig, /public, max-age=31536000, immutable/);
});
