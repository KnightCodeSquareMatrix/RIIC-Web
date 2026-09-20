import { getAgentPlanArtifact, projectPlanResult, saveAgentPlanArtifact } from "../src/server/agent/plan-artifact.ts";
import { getDatabase } from "../src/server/db/index.ts";
import { user } from "../src/server/db/schema.ts";

const db = getDatabase();
const [anyUser] = await db.select({ id: user.id }).from(user).limit(1);
if (!anyUser) {
  console.log("NO USER ROWS — cannot smoke test");
  process.exit(0);
}

const projected = projectPlanResult({
  profile: {
    schema_version: 1,
    layout_label: "243",
    operbox_label: "冒烟测试 Box",
    baseline_label: "baseline",
    summary: { owned: 10, tier_up_owned: 5, trade_pool_ready: 3, manufacture_pool_ready: 2 },
    domains: [],
    rotation: { daily_gold: 12.3, daily_lmd: 45000 },
    baseline_rotation: {},
    actions: [],
    flags: [],
    narration_hints: [],
  },
  maa: {
    title: "smoke",
    plans: [
      { name: "早班", rooms: { trading: [{ operators: ["德克萨斯", "拉普兰德"] }], manufacture: [{ operators: ["红云"] }, { operators: [] }] } },
      { name: "中班", rooms: { trading: [{ operators: ["伺夜"] }] } },
      { name: "晚班", rooms: { trading: [{ operators: ["但书"] }] } },
    ],
  },
  durationMs: 1234,
  diagnosticId: "smoke-diagnostic",
} as never);

const id = await saveAgentPlanArtifact(anyUser.id, projected, {
  layoutPreset: "243",
  boxSource: "sample",
  factoryRecipes: ["originium", "originium", "gold", "gold"],
  operatorCount: 10,
});
const back = await getAgentPlanArtifact(id, anyUser.id);
console.log("saved id:", id);
console.log("read back OK:", back?.plan.layoutLabel === "243" && back?.plan.plans.length === 3 && back?.plan.plans[1].name === "中班");
console.log("wrong-user blocked:", (await getAgentPlanArtifact(id, "00000000-0000-4000-8000-000000000000")) === null);
console.log("VISIT_URL=/plan/" + id);
