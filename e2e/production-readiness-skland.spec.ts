import { expect, test } from "@playwright/test";
import { requestId, diagnosticId, expectUnifiedDialogTypography, expectUnifiedDialogAction, waitForOwnAnimations, planData, authenticatedSklandSnapshot, productionHeavySklandSnapshot, primarySklandAccount, mockApis, openSklandOverview, seedPreferences, seedV4Session } from "./production-readiness.fixture";

test.beforeEach(async ({ page }) => {
  await page.route("**/api/auth/get-session", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      session: { id: "test-session", token: "test-token", userId: "test-user", expiresAt: new Date(Date.now() + 3_600_000).toISOString(), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
      user: { id: "test-user", name: "测试用户", email: "test@example.com", emailVerified: true, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
    }),
  }));
});

test("Skland login centers the QR on every viewport and starts after explicit consent", async ({ page }) => {
  await mockApis(page, { sklandConfigured: true });
  let qrStartRequests = 0;
  await page.route("**/api/skland/auth/qr", (route) => {
    qrStartRequests += 1;
    expect(route.request().postDataJSON()).toEqual({
      consent: {
        termsAccepted: true,
        privacyAccepted: true,
        termsVersion: "2026-08-21-cloud-workspace",
        privacyVersion: "2026-08-27-detailed-telemetry",
      },
    });
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        data: {
          scanId: "scan-login-1",
          scanUrl: "hypergryph://scan_login?scanId=scan-login-1&from=web",
          expiresInSeconds: 600,
        },
        requestId,
      }),
    });
  });
  await page.route("**/api/skland/auth/qr/status", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      success: true,
      data: { status: "waiting" },
      requestId,
    }),
  }));
  await seedPreferences(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await expect(page.locator("[data-skland-account-control]")).toHaveCount(0);
  await expect(page.locator("[data-skland-sidebar-account]")).toHaveCount(0);
  await openSklandOverview(page);
  await expect(page.getByRole("heading", { name: "把当前罗德岛带进排班助手" })).toBeVisible();
  await page.setViewportSize({ width: 375, height: 812 });
  await page.reload();

  await expect(page.locator("[data-skland-account-control]")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "把当前罗德岛带进排班助手" })).toBeVisible();
  await expect(page.getByText(/手机号|验证码|密码/)).toHaveCount(0);
  await expect(page.getByText("使用森空岛 App 扫描二维码，同步当前角色的干员与基建数据。")).toBeVisible();
  await expect(page.getByText("登录凭证只保存在当前浏览器，7 天后失效。")).toBeVisible();
  await expect(page.getByText(/本站不会自动签到或读取社区内容/)).toHaveCount(0);
  expect(qrStartRequests).toBe(0);
  const [mobileQrBox, mobileCopyBox] = await Promise.all([
    page.locator("[data-skland-login-qr]").boundingBox(),
    page.locator("[data-skland-login-copy]").boundingBox(),
  ]);
  expect(mobileCopyBox?.y).toBeLessThan(mobileQrBox?.y ?? 0);

  const consentCheckboxes = page.getByRole("checkbox");
  await expect(consentCheckboxes).toHaveCount(2);
  await expect(page.getByRole("button", { name: /生成|打开森空岛/ })).toHaveCount(0);
  await consentCheckboxes.nth(0).check();
  expect(qrStartRequests).toBe(0);
  await consentCheckboxes.nth(1).check();
  await expect(page.getByRole("img", { name: "森空岛登录二维码" })).toBeVisible();
  await expect(page.getByText("请使用森空岛 App 扫描二维码", { exact: true })).toBeVisible();
  await expect(page.locator("[data-skland-login-panel]")).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  await expect(page.locator("[data-skland-login-copy]")).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  await expect(page.getByRole("link", { name: "本站服务条款" }).first()).toHaveAttribute("href", "/terms");
  await expect(page.getByRole("link", { name: "本站隐私政策" }).first()).toHaveAttribute("href", "/privacy");
  await expect(page.getByText(/skland-kit/i)).toHaveCount(0);

  for (const viewport of [
    { width: 390, height: 844 },
    { width: 768, height: 900 },
    { width: 1440, height: 900 },
  ]) {
    await page.setViewportSize(viewport);
    await expect(page.getByRole("img", { name: "森空岛登录二维码" })).toBeVisible();
    const [sklandPageBox, qrBox] = await Promise.all([
      page.locator("[data-skland-page]").boundingBox(),
      page.locator("[data-skland-qr-visual]").boundingBox(),
    ]);
    expect(sklandPageBox).not.toBeNull();
    expect(qrBox).not.toBeNull();
    const pageCenter = (sklandPageBox?.x ?? 0) + (sklandPageBox?.width ?? 0) / 2;
    const qrCenter = (qrBox?.x ?? 0) + (qrBox?.width ?? 0) / 2;
    expect(qrCenter).toBeCloseTo(pageCenter, 0);
  }
  expect(qrStartRequests).toBe(1);
});

test("Skland login waits for explicit consent and explains slow preparation", async ({ page }) => {
  await mockApis(page, { sklandConfigured: true });
  let qrStartRequests = 0;
  let releaseQr: (() => void) | undefined;
  const qrGate = new Promise<void>((resolve) => {
    releaseQr = resolve;
  });
  await page.route("**/api/skland/auth/qr", async (route) => {
    qrStartRequests += 1;
    await qrGate;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        data: {
          scanId: "scan-login-slow",
          scanUrl: "hypergryph://scan_login?scanId=scan-login-slow",
          expiresInSeconds: 600,
        },
        requestId,
      }),
    });
  });
  await page.route("**/api/skland/auth/qr/status", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      success: true,
      data: { status: "waiting" },
      requestId,
    }),
  }));
  await seedPreferences(page);
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/");

  await page.getByRole("button", { name: "Toggle Sidebar" }).click();
  await openSklandOverview(page);
  expect(qrStartRequests).toBe(0);
  await page.getByRole("checkbox").nth(0).check();
  expect(qrStartRequests).toBe(0);
  await page.getByRole("checkbox").nth(1).check();
  await expect(page.locator("[data-skland-login-qr]").getByRole("status")).toContainText("正在生成二维码…");
  await expect(page.getByText("正在连接登录服务，请稍候…")).toBeVisible({ timeout: 3_000 });
  expect(qrStartRequests).toBe(1);

  releaseQr?.();
  await expect(page.getByRole("img", { name: "森空岛登录二维码" })).toBeVisible();
  expect(qrStartRequests).toBe(1);
});

test("Skland login replaces a scanned QR with progress while authentication finishes", async ({ page }) => {
  await mockApis(page, { sklandConfigured: true });
  await page.route("**/api/skland/auth/qr", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      success: true,
      data: {
        scanId: "scan-login-confirming",
        scanUrl: "hypergryph://scan_login?scanId=scan-login-confirming",
        expiresInSeconds: 600,
      },
      requestId,
    }),
  }));
  await page.route("**/api/skland/auth/qr/status", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      success: true,
      data: { status: "scanned" },
      requestId,
    }),
  }));
  await seedPreferences(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");

  await page.getByRole("button", { name: "Toggle Sidebar" }).click();
  await openSklandOverview(page);
  await page.getByRole("checkbox").nth(0).check();
  await page.getByRole("checkbox").nth(1).check();
  await expect(page.getByRole("img", { name: "森空岛登录二维码" })).toBeVisible();
  await expect(page.locator("[data-skland-login-progress]")).toBeVisible({ timeout: 10_000 });
  await expect(page.getByRole("img", { name: "森空岛登录二维码" })).toHaveCount(0);
  await expect(page.getByRole("status")).toContainText("已扫码，正在等待森空岛 App 确认并完成登录…");
});

test("Skland restore waits for website authentication and then starts summary and full requests once", async ({ page }) => {
  let releaseWebsiteSession!: () => void;
  const websiteSessionGate = new Promise<void>((resolve) => { releaseWebsiteSession = resolve; });
  let fullSessionRequests = 0;
  let summarySessionRequests = 0;
  await page.unroute("**/api/auth/get-session");
  await page.route("**/api/auth/get-session", async (route) => {
    await websiteSessionGate;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        session: {
          id: "test-session",
          token: "test-token",
          userId: "test-user",
          expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        user: {
          id: "test-user",
          name: "测试用户",
          email: "test@example.com",
          emailVerified: true,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      }),
    });
  });
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.pathname === "/api/skland/accounts" && !url.searchParams.has("mode") && request.method() === "GET") {
      fullSessionRequests += 1;
    }
    if (url.pathname === "/api/skland/accounts" && url.searchParams.get("mode") === "summary" && request.method() === "GET") {
      summarySessionRequests += 1;
    }
  });
  await mockApis(page, { sklandConfigured: true, sklandSnapshot: authenticatedSklandSnapshot });
  await seedPreferences(page);
  const navigation = page.goto("/");

  await page.waitForTimeout(100);
  expect(fullSessionRequests).toBe(0);
  expect(summarySessionRequests).toBe(0);
  releaseWebsiteSession();
  await navigation;
  await expect.poll(() => fullSessionRequests).toBe(1);
  await expect.poll(() => summarySessionRequests).toBe(1);
});

test("Skland login loads full status by default and deletion preserves non-Skland data", async ({ page }) => {
  const statusMethods: string[] = [];
  let releaseAvatar!: () => void;
  const avatarGate = new Promise<void>((resolve) => { releaseAvatar = resolve; });
  const snapshotWithAvatar = {
    ...authenticatedSklandSnapshot,
    player: {
      ...authenticatedSklandSnapshot.player,
      avatarUrl: "https://example.com/skland-avatar.png",
    },
  };
  await page.route(snapshotWithAvatar.player.avatarUrl, async (route) => {
    await avatarGate;
    await route.fulfill({
      status: 200,
      contentType: "image/png",
      body: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64"),
    });
  });
  page.on("request", (request) => {
    if (new URL(request.url()).pathname === "/api/skland/status/refresh") statusMethods.push(request.method());
  });
  await mockApis(page, {
    sklandConfigured: true,
    sklandSnapshot: snapshotWithAvatar,
  });
  await seedV4Session(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.locator("[data-skland-account-avatar] img")).toHaveAttribute(
    "src",
    snapshotWithAvatar.player.avatarUrl
  );
  const calculatorAccount = page.locator("[data-skland-account-control]:visible");
  await expect(calculatorAccount.locator('[data-remote-avatar-state="loading"]')).toBeVisible();
  await expect(calculatorAccount.locator('[data-slot="skeleton"]')).toBeVisible();
  const compactAvatarBox = await calculatorAccount.locator("[data-remote-avatar-state]").boundingBox();
  expect(compactAvatarBox?.width).toBeCloseTo(42, 0);
  await page.getByRole("button", { name: "Toggle Sidebar" }).click();
  await openSklandOverview(page);

  const statusAvatar = page.locator('[data-skland-page] [data-remote-avatar-state="loading"]');
  await expect(statusAvatar).toBeVisible();
  const statusAvatarBox = await statusAvatar.boundingBox();
  expect(statusAvatarBox?.width).toBeCloseTo(56, 0);
  expect(statusAvatarBox?.height).toBeCloseTo(56, 0);
  releaseAvatar();
  await expect(page.locator('[data-skland-page] [data-remote-avatar-state="loaded"]')).toBeVisible();
  await expect(page.locator('[data-skland-page] [data-remote-avatar-state="loaded"] img')).toBeVisible();

  await expect(page.getByText("UID 123••••789")).toBeVisible();
  await expect(page.getByRole("button", { name: "启用状态中心" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "撤回状态中心授权" })).toHaveCount(0);
  await expect.poll(() => statusMethods).toEqual([]);
  const [postStatus, deleteStatus] = await Promise.all([
    page.request.post("/api/skland/status"),
    page.request.delete("/api/skland/status"),
  ]);
  expect(postStatus.status()).toBe(405);
  expect(deleteStatus.status()).toBe(405);
  const dataControls = page.locator("[data-skland-data-controls]");
  await expect(dataControls).toContainText("MAA 导入与手动布局会保留");
  expect(await dataControls.evaluate((element) => element.parentElement?.lastElementChild === element)).toBe(true);
  const deleteAll = page.getByRole("button", { name: "按住删除全部森空岛数据" });
  await deleteAll.click();
  await expect(page.getByRole("heading", { name: "把当前罗德岛带进排班助手" })).toHaveCount(0);
  const deleteBox = await deleteAll.boundingBox();
  expect(deleteBox).not.toBeNull();
  await page.mouse.move(deleteBox!.x + deleteBox!.width / 2, deleteBox!.y + deleteBox!.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(1900);
  await page.mouse.up();
  await expect(page.getByRole("heading", { name: "把当前罗德岛带进排班助手" })).toBeVisible();

  await page.getByRole("button", { name: "Toggle Sidebar" }).click();
  await page.getByRole("button", { name: "基建计算器", exact: true }).click();
  await expect(page.locator("[data-plan-board]")).toHaveAttribute("data-plan-revision", diagnosticId);
});

test("Skland status center keeps profile and recruitment in overview and supports role switching", async ({ page }) => {
  test.setTimeout(90_000);
  const switchedSnapshot = {
    ...authenticatedSklandSnapshot,
    player: {
      ...authenticatedSklandSnapshot.player,
      uid: "987654321",
      nickname: "测试博士二号",
    },
    infrastructure: {
      ...authenticatedSklandSnapshot.infrastructure,
      training: null,
    },
    sourceName: "森空岛同步",
  };
  let attendanceRequests = 0;
  let statusRequests = 0;
  let currentStatusSnapshot: typeof authenticatedSklandSnapshot | typeof switchedSnapshot = authenticatedSklandSnapshot;
  page.on("request", (request) => {
    if (/attendance|sign/i.test(request.url())) attendanceRequests += 1;
    if (new URL(request.url()).pathname === "/api/skland/status/refresh") statusRequests += 1;
  });
  await mockApis(page, {
    sklandConfigured: true,
    sklandSnapshot: authenticatedSklandSnapshot,
  });
  await page.route("**/api/skland/role", (route) => {
    currentStatusSnapshot = switchedSnapshot;
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "X-Request-Id": requestId },
      body: JSON.stringify({
        success: true,
        data: {
          authenticated: true,
          configured: true,
          authMethods: { qr: true },
          accounts: [{
            ...primarySklandAccount,
            selectedUid: switchedSnapshot.player.uid,
            roles: switchedSnapshot.roles,
          }],
          activeAccountId: primarySklandAccount.accountId,
          scheduleSnapshot: switchedSnapshot,
          statusSnapshot: switchedSnapshot,
        },
        requestId,
      }),
    });
  });
  await page.route("**/api/skland/status/refresh", (route) => {
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "X-Request-Id": requestId },
      body: JSON.stringify({
        success: true,
        data: {
          accounts: [{
            ...primarySklandAccount,
            selectedUid: currentStatusSnapshot.player.uid,
            roles: currentStatusSnapshot.roles,
          }],
          activeAccountId: primarySklandAccount.accountId,
          snapshot: currentStatusSnapshot,
        },
        requestId,
      }),
    });
  });
  await seedPreferences(page);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  await expect(page.locator('[data-workbench-hydrated="true"]')).toBeVisible();
  const scheduleViewTab = page.getByRole("tab", { name: "列表式布局" });
  await expect(scheduleViewTab).toBeVisible();
  await openSklandOverview(page);
  await expect(page.locator("[data-calculator-controls]")).toHaveCount(0);

  await expect(page.getByRole("img", { name: "测试博士的森空岛头像" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "测试博士" }).first()).toBeVisible();
  await expect(page.getByText("UID 123••••789")).toBeVisible();
  const accountCombobox = page.getByRole("combobox", { name: "选择账号与角色" });
  await expect(accountCombobox).toHaveValue("测试博士 · 官服");
  await expect(accountCombobox).not.toHaveValue(/123456789/);
  await accountCombobox.click();
  await waitForOwnAnimations(page.locator('[data-slot="combobox-content"]'));
  const [accountFieldBox, accountPopupBox] = await Promise.all([
    accountCombobox.locator("xpath=..").boundingBox(),
    page.locator('[data-slot="combobox-content"]').boundingBox(),
  ]);
  expect(accountPopupBox?.width).toBeCloseTo(accountFieldBox?.width ?? 0, 0);
  await accountCombobox.press("Escape");
  await expect(page.locator('[data-slot="select-trigger"]')).toHaveCount(0);
  await expect(page.getByRole("tab", { name: "概览", exact: true })).toBeVisible();
  await expect(page.getByRole("tab", { name: "基建", exact: true })).toBeVisible();
  await expect(page.getByRole("tab", { name: "进度", exact: true })).toHaveCount(0);
  await expect(page.locator("[data-skland-view-tabs]")).toHaveAttribute("data-variant", "default");
  await expect(page.locator("[data-skland-view-tabs] svg")).toHaveCount(0);
  const layoutSync = page.locator('[data-slot="skland-layout-sync"]');
  await expect(layoutSync).toBeVisible();
  await expect(layoutSync).not.toHaveClass(/infra-room-surface/);
  const [viewTabsBox, layoutSyncBox] = await Promise.all([
    page.locator("[data-skland-view-tabs]").boundingBox(),
    layoutSync.boundingBox(),
  ]);
  expect((layoutSyncBox?.x ?? 0)).toBeGreaterThan(viewTabsBox?.x ?? 0);
  const dataControlsBox = await page.locator("[data-skland-data-controls]").boundingBox();
  expect(dataControlsBox?.y).toBeGreaterThan(viewTabsBox?.y ?? 0);
  const sklandViewTabHeight = await page.getByRole("tab", { name: "概览", exact: true })
    .evaluate((element) => element.getBoundingClientRect().height);
  expect(sklandViewTabHeight).toBeCloseTo(26, 0);
  await expect(page.getByRole("tab", { name: "干员", exact: true })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "实时数据", exact: true })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "基建数据", exact: true })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "当前理智", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "无人机", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "日常与周常", exact: true })).toBeVisible();
  await expect(page.locator("[data-skland-metric]")).toHaveCount(0);
  await expect(page.getByText("4 项状态提醒")).toBeVisible();
  await expect(page.getByText("博士档案", { exact: true })).toBeVisible();
  await expect(page.getByText("收藏概况", { exact: true })).toBeVisible();
  const overviewRecruit = page.locator('section[aria-labelledby="overview-recruit-title"]');
  await expect(overviewRecruit.getByRole("heading", { name: "公开招募", exact: true })).toBeVisible();
  await expect(overviewRecruit.getByText("槽位 1")).toBeVisible();

  await page.getByRole("tab", { name: "基建", exact: true }).click();
  await expect(page.getByRole("region", { name: "基建概览", exact: true })).toBeVisible();
  await expect(page.locator('[data-skland-metric="rest"]')).toHaveAttribute("data-metric-tone", "green");
  await expect(page.locator('[data-skland-metric="trading"]')).toHaveAttribute("data-metric-tone", "blue");
  await expect(page.locator('[data-skland-metric="manufacture"]')).toHaveAttribute("data-metric-tone", "amber");
  await expect(page.locator('[data-skland-metric="clue"]')).toHaveAttribute("data-metric-tone", "orange");
  await expect(page.locator('[data-skland-metric] .infra-room-surface')).toHaveCount(4);
  await expect(page.locator('[data-skland-metric] .infra-room-emblem')).toHaveCount(0);
  await expect(page.locator('[data-slot="skland-training-room"]')).toHaveClass(/infra-room-surface/);
  await expect(page.locator('[data-slot="skland-infra-assets"]')).toHaveClass(/infra-room-surface/);
  await expect(page.locator('[data-slot^="skland-"] .infra-room-emblem')).toHaveCount(0);
  await expect(page.locator('[data-slot="skland-layout-sync"] svg').first()).toBeVisible();
  await expect(page.locator('[data-slot="skland-training-room"] svg').first()).toBeVisible();
  await expect(page.locator('[data-slot="skland-infra-assets"] svg').first()).toBeVisible();
  await expect(page.getByRole("heading", { name: "当前基建", exact: true })).toBeVisible();
  await expect(page.getByText("按计算器布局排列，快速核对进驻、心情与生产状态。", { exact: true })).toHaveCount(0);
  await expect(page.locator("[data-skland-compact-layout]")).toBeVisible();
  await expect(page.locator('[data-skland-compact-layout] article[data-room-group]')).toHaveCount(8);
  const currentTrainingRoom = page.locator('[data-skland-compact-layout] [data-room-group="training"]');
  await expect(currentTrainingRoom).toBeVisible();
  await expect(currentTrainingRoom).toContainText("2/2");
  await expect(currentTrainingRoom.locator('[data-position="训练位"]')).toContainText("凯尔希");
  await expect(currentTrainingRoom.locator('[data-position="协助位"]')).toContainText("阿米娅");
  await expect(currentTrainingRoom.locator('[aria-label^="训练位："]')).toHaveCount(1);
  await expect(currentTrainingRoom.locator('[aria-label^="协助位："]')).toHaveCount(1);
  await expect(currentTrainingRoom.locator('img[title^="职业："]')).toHaveCount(2);
  await expect(page.locator('[data-skland-compact-layout] [data-room-group="processing"]')).toBeVisible();
  await expect(page.getByText(/^线索板：/)).toHaveCount(0);
  const auxiliaryRoomBoxes = await page.locator(".skland-auxiliary-grid article").evaluateAll((rooms) => Object.fromEntries(
    rooms.map((room) => {
      const bounds = room.getBoundingClientRect();
      return [room.dataset.roomGroup, { x: bounds.x, width: bounds.width }];
    }),
  ));
  expect(auxiliaryRoomBoxes.meeting.x).toBeCloseTo(auxiliaryRoomBoxes.training.x, 0);
  expect(auxiliaryRoomBoxes.hire.x).toBeCloseTo(auxiliaryRoomBoxes.processing.x, 0);
  expect(auxiliaryRoomBoxes.meeting.width).toBeGreaterThan(auxiliaryRoomBoxes.hire.width);
  const compactColumns = page.locator("[data-skland-compact-column]");
  await expect(compactColumns).toHaveCount(2);
  const compactColumnBottoms = await compactColumns.evaluateAll((columns) => columns.map((column) => (
    column.getBoundingClientRect().bottom
  )));
  expect(Math.abs(compactColumnBottoms[0] - compactColumnBottoms[1])).toBeLessThanOrEqual(1);
  const compactLastRoomBottoms = await compactColumns.evaluateAll((columns) => columns.map((column) => {
    const rooms = column.querySelectorAll<HTMLElement>("article[data-room-group]");
    return rooms.item(rooms.length - 1).getBoundingClientRect().bottom;
  }));
  expect(Math.abs(compactLastRoomBottoms[0] - compactLastRoomBottoms[1])).toBeLessThanOrEqual(1);
  const compactRoomEmblem = page.locator("[data-skland-compact-layout] .infra-room-emblem").first();
  await expect(compactRoomEmblem).toBeVisible();
  await expect.poll(() => compactRoomEmblem.evaluate((element) => ({
    backgroundSize: getComputedStyle(element).backgroundSize,
    opacity: getComputedStyle(element).opacity,
  }))).toEqual({ backgroundSize: "auto 100%", opacity: "0.16" });
  await expect(page.getByRole("heading", { name: "控制中枢", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "贸易站 1", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "制造站 1", exact: true })).toBeVisible();
  await expect(page.locator(".infra-room-surface").first()).toBeVisible();
  await expect(page.locator('.level-diamonds[data-variant="compact"]').first()).toBeVisible();
  await expect(page.locator(".infra-operator-slot").first()).toBeVisible();
  await expect(page.getByRole("img", { name: "阿米娅" }).first()).toBeVisible();
  await expect(page.getByText("氛围 5000", { exact: true })).toBeVisible();
  await expect(page.getByText("宿舍氛围 5000", { exact: true })).toHaveCount(0);
  await expect(page.getByText("当前进驻", { exact: true })).toHaveCount(0);
  await expect(page.getByText("设施运行正常", { exact: true })).toHaveCount(0);
  await expect(page.locator("[data-infra-complete-time]").first()).toHaveText(/^\d{4}\.\d{1,2}\.\d{1,2} \d{2}:\d{2}$/);
  await expect(page.getByText("已有 4 · 待接收 2 · 已接收 1", { exact: false })).toHaveCount(0);

  await accountCombobox.click();
  await page.getByRole("option", { name: "测试博士二号 · B服" }).click();
  await expect(page.getByRole("heading", { name: "测试博士二号" }).first()).toBeVisible();
  await expect(page.getByRole("img", { name: "测试博士二号的森空岛头像" })).toBeVisible();
  await expect(page.getByRole("button", { name: "刷新" })).toHaveCount(0);
  const trainingRoom = page.locator('[data-slot="skland-training-room"]');
  await expect(trainingRoom.getByText("当前空闲", { exact: true })).toBeVisible();
  await expect(trainingRoom.getByText("暂无训练任务", { exact: true })).toBeVisible();
  await page.getByRole("tab", { name: "概览", exact: true }).click();
  await expect(page.getByText("训练任务已完成", { exact: true })).toHaveCount(0);

  await expect.poll(async () => page.evaluate(() => JSON.stringify(localStorage))).not.toContain("987654321");
  const persisted = await page.evaluate(() => JSON.stringify(localStorage));
  expect(persisted).not.toContain("为了更好的明天");
  expect(persisted).not.toContain('"progress"');

  for (const viewport of [
    { width: 390, height: 844 },
    { width: 768, height: 900 },
    { width: 1440, height: 1000 },
  ]) {
    await page.setViewportSize(viewport);
    const dimensions = await page.evaluate(() => ({
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
    }));
    expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
  }

  await page.getByRole("button", { name: "退出" }).click();
  await expect(page.getByRole("heading", { name: "把当前罗德岛带进排班助手" })).toBeVisible();
  expect(attendanceRequests).toBe(0);
  expect(statusRequests).toBe(0);
});

test("Skland layout sync stays beside the tabs and confirms replacement of dirty settings", async ({ page }) => {
  await mockApis(page, {
    sklandConfigured: true,
    sklandSnapshot: authenticatedSklandSnapshot,
  });
  await seedV4Session(page, planData, { layoutDirty: true });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");

  await openSklandOverview(page);
  const layoutSync = page.locator('[data-slot="skland-layout-sync"]');
  await expect(layoutSync).toContainText("森空岛布局 243");
  const applyButton = layoutSync.getByRole("button", { name: "应用布局" });
  await expect(applyButton).toBeEnabled();
  await applyButton.click();

  const dialog = page.getByRole("dialog", { name: "覆盖当前布局设置？" });
  await expect(dialog).toBeVisible();
  await expectUnifiedDialogTypography(dialog);
  await expectUnifiedDialogAction(dialog.getByRole("button", { name: "取消" }), { height: "46px" });
  await expectUnifiedDialogAction(dialog.getByRole("button", { name: "覆盖并应用" }), { width: "196px", height: "46px" });
  await dialog.getByRole("button", { name: "覆盖并应用" }).click();
  await expect(layoutSync.getByRole("button", { name: "已同步" })).toBeDisabled();
});

test("Skland base metrics reuse the existing technical card grid and keyboard tab navigation", async ({ page }) => {
  await mockApis(page, {
    sklandConfigured: true,
    sklandSnapshot: authenticatedSklandSnapshot,
  });
  await seedPreferences(page);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  await openSklandOverview(page);
  await page.getByRole("tab", { name: "基建", exact: true }).click();

  for (const viewport of [
    { width: 390, height: 844 },
    { width: 768, height: 960 },
    { width: 1440, height: 1000 },
  ]) {
    await page.setViewportSize(viewport);
    const buildingCards = page.locator('[data-skland-metric-section="building"] [data-skland-metric]');
    await expect(buildingCards).toHaveCount(4);
    await expect(page.locator("[data-skland-overview-grid] > *")).toHaveCount(6);
    await expect(page.locator("[data-skland-metric-glyph]")).toHaveCount(0);

    const widthState = await page.evaluate(() => ({
      overflow: document.documentElement.scrollWidth - window.innerWidth,
      viewportWidth: window.innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
      offenders: Array.from(document.querySelectorAll<HTMLElement>("body *"))
        .map((element) => {
          const rect = element.getBoundingClientRect();
          return { tag: element.tagName, className: element.className, left: rect.left, right: rect.right, width: rect.width };
        })
        .filter((rect) => rect.right > window.innerWidth + 1 || rect.left < -1)
        .slice(0, 8),
    }));
    expect(widthState.overflow, JSON.stringify(widthState)).toBeLessThanOrEqual(1);
  }

  const overviewTab = page.getByRole("tab", { name: "概览", exact: true });
  const infrastructureTab = page.getByRole("tab", { name: "基建", exact: true });
  await expect(page.locator("[data-skland-view-tabs] [role=tab]")).toHaveText(["概览", "基建"]);
  await expect(page.getByRole("tab", { name: "进度", exact: true })).toHaveCount(0);
  await overviewTab.focus();
  await overviewTab.press("ArrowRight");
  await expect(infrastructureTab).toBeFocused();
  await infrastructureTab.press("ArrowRight");
  await expect(overviewTab).toBeFocused();
});

test("Skland compact layout aligns both column endings when production is taller", async ({ page }) => {
  await mockApis(page, {
    sklandConfigured: true,
    sklandSnapshot: productionHeavySklandSnapshot,
  });
  await seedPreferences(page);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");

  await openSklandOverview(page);
  await page.getByRole("tab", { name: "基建", exact: true }).click();

  const compactColumns = page.locator("[data-skland-compact-column]");
  await expect(compactColumns).toHaveCount(2);
  await expect.poll(() => compactColumns.nth(1).evaluate((column) => (
    getComputedStyle(column).justifyContent
  ))).toBe("normal");

  const compactLastRoomBottoms = await compactColumns.evaluateAll((columns) => columns.map((column) => {
    const rooms = column.querySelectorAll<HTMLElement>("article[data-room-group]");
    return rooms.item(rooms.length - 1).getBoundingClientRect().bottom;
  }));
  expect(Math.abs(compactLastRoomBottoms[0] - compactLastRoomBottoms[1])).toBeLessThanOrEqual(2);

  const alignedRoomBoxes = await page.locator('[data-skland-compact-layout] article[data-room-group]').evaluateAll((rooms) => {
    const boxes = rooms.map((room) => {
      const bounds = room.getBoundingClientRect();
      return { group: room.dataset.roomGroup, top: bounds.top, bottom: bounds.bottom, height: bounds.height };
    });
    const group = (name: string) => boxes.filter((box) => box.group === name);
    return {
      controlBottom: group("control")[0]?.bottom,
      tradeTop: group("trading")[0]?.top,
      trainingTop: group("training")[0]?.top,
      trainingHeight: group("training")[0]?.height,
      meetingHeight: group("meeting")[0]?.height,
      lastManufactureBottom: group("manufacture").at(-1)?.bottom,
      powerTop: group("power")[0]?.top,
    };
  });
  expect(Math.abs((alignedRoomBoxes.tradeTop ?? 0) - (alignedRoomBoxes.trainingTop ?? 0))).toBeLessThanOrEqual(1);
  expect((alignedRoomBoxes.tradeTop ?? 0) - (alignedRoomBoxes.controlBottom ?? 0)).toBeCloseTo(12, 0);
  expect(alignedRoomBoxes.trainingHeight).toBeLessThan(alignedRoomBoxes.meetingHeight ?? 0);
  expect(alignedRoomBoxes.meetingHeight).toBeLessThanOrEqual(150);
  expect(alignedRoomBoxes.trainingHeight).toBeLessThanOrEqual(112);
  expect((alignedRoomBoxes.powerTop ?? 0) - (alignedRoomBoxes.lastManufactureBottom ?? 0)).toBeCloseTo(12, 0);
  await expect(page.locator('[data-skland-compact-column="auxiliary"] > [data-room-group="dormitory"]').first()).toHaveCSS("flex-grow", "1");
  await expect(page.locator('[data-room-group="power"] [data-skland-power-efficiency]')).toHaveCount(3);
  await expect(page.locator('[data-room-group="power"] [data-skland-power-efficiency]').first()).toHaveText("效率基准 100%");

  for (const viewport of [{ width: 390, height: 844 }, { width: 768, height: 960 }]) {
    await page.setViewportSize(viewport);
    const dimensions = await page.evaluate(() => ({
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
    }));
    expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
    await expect(page.locator('[data-skland-compact-layout] [data-skland-power-efficiency]')).toHaveCount(3);
  }
});

test("Skland supports adding, switching, and individually logging out multiple accounts", async ({ page }) => {
  const secondarySnapshot = {
    ...authenticatedSklandSnapshot,
    player: {
      ...authenticatedSklandSnapshot.player,
      uid: "246813579",
      nickname: "第二账号博士",
      channelName: "官服",
    },
    roles: [{
      uid: "246813579",
      nickname: "第二账号博士",
      channelName: "官服",
      isDefault: true,
    }],
  };
  const secondaryAccount = {
    accountId: "account_secondary",
    selectedUid: secondarySnapshot.player.uid,
    roles: secondarySnapshot.roles,
    credentialExpiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000,
  };
  let currentSnapshot = authenticatedSklandSnapshot;
  let currentAccounts = [primarySklandAccount];
  let currentAccountId: string | null = primarySklandAccount.accountId;

  await mockApis(page, {
    sklandConfigured: true,
    sklandSnapshot: authenticatedSklandSnapshot,
  });
  await page.route(/\/api\/skland\/accounts(?:[/?]|$)/, async (route) => {
    if (route.request().method() === "DELETE") {
      const accountId = decodeURIComponent(new URL(route.request().url()).pathname.split("/").pop() ?? "");
      currentAccounts = currentAccounts.filter((account) => account.accountId !== accountId);
      if (currentAccounts.length) {
        const nextAccount = currentAccounts[0];
        currentAccountId = nextAccount.accountId;
        currentSnapshot = nextAccount.accountId === secondaryAccount.accountId
          ? secondarySnapshot
          : authenticatedSklandSnapshot;
      } else {
        currentAccountId = null;
      }
    }
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "X-Request-Id": requestId },
      body: JSON.stringify({
        success: true,
        data: {
          authenticated: currentAccounts.length > 0,
          configured: true,
          authMethods: { qr: true },
          accounts: currentAccounts,
          activeAccountId: currentAccountId,
          ...(currentAccounts.length ? { scheduleSnapshot: currentSnapshot } : {}),
          ...(currentAccounts.length ? { statusSnapshot: currentSnapshot } : {}),
        },
        requestId,
      }),
    });
  });
  await page.route("**/api/skland/auth/qr", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    headers: { "X-Request-Id": requestId },
    body: JSON.stringify({
      success: true,
      data: {
        scanId: "scan-second-account",
        scanUrl: "hypergryph://scan_login?scanId=scan-second-account",
        expiresInSeconds: 600,
      },
      requestId,
    }),
  }));
  await page.route("**/api/skland/auth/qr/status", (route) => {
    currentAccounts = [primarySklandAccount, secondaryAccount];
    currentAccountId = secondaryAccount.accountId;
    currentSnapshot = secondarySnapshot;
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "X-Request-Id": requestId },
      body: JSON.stringify({
        success: true,
        data: {
          status: "authenticated",
          accounts: currentAccounts,
          activeAccountId: currentAccountId,
          scheduleSnapshot: currentSnapshot,
          statusSnapshot: currentSnapshot,
        },
        requestId,
      }),
    });
  });
  await page.route("**/api/skland/role", async (route) => {
    const body = route.request().postDataJSON() as { accountId: string; uid: string };
    const selectedAccount = currentAccounts.find((account) => account.accountId === body.accountId);
    currentAccountId = body.accountId;
    currentSnapshot = body.accountId === secondaryAccount.accountId
      ? secondarySnapshot
      : {
          ...authenticatedSklandSnapshot,
          player: {
            ...authenticatedSklandSnapshot.player,
            uid: body.uid,
            nickname: selectedAccount?.roles.find((role) => role.uid === body.uid)?.nickname ?? "测试博士",
          },
        };
    currentAccounts = currentAccounts.map((account) => account.accountId === body.accountId
      ? { ...account, selectedUid: body.uid }
      : account);
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "X-Request-Id": requestId },
      body: JSON.stringify({
        success: true,
        data: {
          authenticated: true,
          configured: true,
          accounts: currentAccounts,
          activeAccountId: currentAccountId,
          scheduleSnapshot: currentSnapshot,
          statusSnapshot: currentSnapshot,
        },
        requestId,
      }),
    });
  });
  await page.route("**/api/skland/status/refresh", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    headers: { "X-Request-Id": requestId },
    body: JSON.stringify({
      success: true,
      data: {
        accounts: currentAccounts,
        activeAccountId: currentAccountId,
        snapshot: currentSnapshot,
      },
      requestId,
    }),
  }));

  await seedPreferences(page);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");

  const calculatorAccount = page.locator("[data-skland-account-control]");
  const calculatorAvatar = page.locator("[data-skland-account-avatar]");
  const accountSelect = page.locator("[data-skland-account-select]");
  const addAccount = page.locator("[data-skland-add-account]");
  const logout = page.locator("[data-skland-logout]");
  await expect(calculatorAccount).toBeVisible();
  await expect(calculatorAvatar).toBeVisible();
  const avatarBox = await calculatorAvatar.boundingBox();
  const calculatorAccountBox = await calculatorAccount.boundingBox();
  const setupBox = await page.getByRole("button", { name: "配置Box与布局" }).boundingBox();
  expect(avatarBox?.width).toBeCloseTo(34, 0);
  expect(calculatorAccountBox?.height).toBeCloseTo(36, 0);
  expect(calculatorAccountBox?.height).toBeCloseTo(setupBox?.height ?? 0, 0);
  await expect.poll(() => calculatorAccount.evaluate((element) => getComputedStyle(element).borderTopLeftRadius)).toBe("0px");
  await openSklandOverview(page);
  await expect(calculatorAccount).toHaveCount(0);
  const controlHeights = await Promise.all([
    accountSelect.evaluate((element) => element.getBoundingClientRect().height),
    addAccount.evaluate((element) => element.getBoundingClientRect().height),
    logout.evaluate((element) => element.getBoundingClientRect().height),
  ]);
  for (const height of controlHeights) {
    expect(height).toBeCloseTo(44, 2);
  }
  await expect(logout).toHaveClass(/text-destructive/);

  await page.setViewportSize({ width: 390, height: 844 });
  const mobileControlHeights = await Promise.all([
    accountSelect.evaluate((element) => element.getBoundingClientRect().height),
    addAccount.evaluate((element) => element.getBoundingClientRect().height),
    logout.evaluate((element) => element.getBoundingClientRect().height),
  ]);
  for (const height of mobileControlHeights) {
    expect(height).toBeCloseTo(44, 2);
  }
  await page.setViewportSize({ width: 1440, height: 1000 });

  await addAccount.click();
  const addAccountDialog = page.getByRole("dialog", { name: "添加森空岛账号" });
  await expect(addAccountDialog).toBeVisible();
  await expectUnifiedDialogTypography(addAccountDialog);
  await expect(addAccountDialog).toHaveCSS("width", "880px");
  await expect(addAccountDialog.locator("[data-skland-login-panel]")).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  const generateLoginQr = addAccountDialog.getByRole("button", { name: "生成登录二维码" });
  await expectUnifiedDialogAction(generateLoginQr, { width: "196px", height: "46px" });
  await addAccountDialog.getByRole("checkbox").nth(0).check();
  await addAccountDialog.getByRole("checkbox").nth(1).check();
  await generateLoginQr.click();
  await expect(page.getByRole("heading", { name: "第二账号博士" }).first()).toBeVisible({ timeout: 12_000 });

  const accountCombobox = page.getByRole("combobox", { name: "选择账号与角色" });
  await accountCombobox.fill("测试博士");
  await expect(page.getByRole("option", { name: "测试博士 · 官服" })).toBeVisible();
  await expect(page.getByRole("option", { name: "第二账号博士 · 官服" })).toHaveCount(0);
  await expect(page.getByText("森空岛账号 1 · 测试博士", { exact: true })).toBeVisible();
  await expect(page.getByText("森空岛账号 2 · 第二账号博士", { exact: true })).toHaveCount(0);
  await page.getByRole("option", { name: "测试博士 · 官服" }).click();
  await expect(accountCombobox).toHaveValue("测试博士 · 官服");
  await expect(page.getByRole("heading", { name: "测试博士" }).first()).toBeVisible();

  await logout.click();
  await expect(page.getByRole("heading", { name: "第二账号博士" }).first()).toBeVisible();
  await logout.click();
  await expect(page.getByRole("heading", { name: "把当前罗德岛带进排班助手" })).toBeVisible();
  await expect(page.locator("[data-skland-account-control]")).toHaveCount(0);
  await page.getByRole("button", { name: "Toggle Sidebar" }).click();
  await page.getByRole("button", { name: "基建计算器", exact: true }).click();
  await expect(page.locator("[data-skland-account-control]")).toHaveCount(0);

  const persisted = await page.evaluate(() => JSON.stringify(localStorage));
  expect(persisted).not.toContain(primarySklandAccount.accountId);
  expect(persisted).not.toContain(secondaryAccount.accountId);
  expect(persisted).not.toContain(secondarySnapshot.player.uid);
});

test("Skland disables adding another account after five accounts", async ({ page }) => {
  const accounts = Array.from({ length: 5 }, (_, index) => ({
    ...primarySklandAccount,
    accountId: `account_limit_${index}`,
  }));
  await mockApis(page, {
    sklandConfigured: true,
    sklandSnapshot: authenticatedSklandSnapshot,
    sklandAccounts: accounts,
    activeAccountId: accounts[0].accountId,
  });
  await seedPreferences(page);
  await page.goto("/");
  await openSklandOverview(page);

  const addAccount = page.locator("[data-skland-add-account]");
  await expect(addAccount).toBeDisabled();
  await expect(addAccount).toHaveAttribute("title", "最多可登录 5 个森空岛账号");
});

test("setup routes Skland account actions to the status center", async ({ page }) => {
  await mockApis(page, {
    sklandConfigured: true,
    sklandSnapshot: authenticatedSklandSnapshot,
  });
  await seedPreferences(page);
  await page.goto("/");

  await expect(page.locator("[data-skland-account-control]")).toBeVisible();
  await page.locator("[data-calculator-controls] [data-calculator-setup-group]")
    .getByRole("button", { name: "配置Box与布局" })
    .click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: /第 1 步，共 3 步：干员数据/ }).click();
  const changeSource = dialog.getByRole("button", { name: "更换", exact: true });
  if (await changeSource.isVisible()) await changeSource.click();
  const sklandTab = dialog.getByRole("tab", { name: "森空岛", exact: true });
  if (await sklandTab.isVisible()) await sklandTab.click();
  await expect(dialog.getByText(/测试博士/).first()).toBeVisible();
  await expect(dialog.getByRole("button", { name: "前往森空岛同步" })).toBeVisible();
  await expect(page.getByRole("button", { name: "使用当前干员数据" })).toHaveCount(0);
  await dialog.getByRole("button", { name: "前往森空岛同步" }).click();
  await expect(page.getByRole("heading", { name: "测试博士" }).first()).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("setup can restore cached Skland data after switching to the sample", async ({ page }) => {
  await mockApis(page, {
    sklandConfigured: true,
    sklandSnapshot: authenticatedSklandSnapshot,
  });
  await seedV4Session(page);
  await page.goto("/");

  await page.getByRole("button", { name: "配置Box与布局" }).first().click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: /第 1 步，共 3 步：干员数据/ }).click();
  await dialog.getByRole("button", { name: "更换", exact: true }).click();
  await dialog.getByRole("tab", { name: "森空岛", exact: true }).click();

  await expect(dialog.getByRole("button", { name: "使用森空岛数据", exact: true })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "重新同步", exact: true })).toBeVisible();
  await dialog.getByRole("button", { name: "使用森空岛数据", exact: true }).click();

  await expect(dialog.getByRole("button", { name: /第 2 步，共 3 步：布局/ })).toHaveAttribute("aria-current", "step");
  await expect(dialog.getByRole("button", { name: "检查设施", exact: true })).toBeVisible();
  await dialog.getByRole("button", { name: /第 1 步，共 3 步：干员数据/ }).click();
  await expect(dialog.getByText("森空岛同步", { exact: true })).toBeVisible();
  await expect(dialog.getByText("2 名干员 · 2 名可用", { exact: true })).toBeVisible();
});

test("settings clears local product data without logging out of Skland", async ({ page }) => {
  await mockApis(page);
  await seedV4Session(page);
  let logoutRequests = 0;
  page.on("request", (request) => {
    if (request.url().includes("/api/skland/accounts/") && request.method() === "DELETE") {
      logoutRequests += 1;
    }
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect.poll(() => page.evaluate(() => window.localStorage.getItem("arknights-infra-telemetry-session"))).not.toBeNull();
  const telemetrySessionBeforeClear = await page.evaluate(() => window.localStorage.getItem("arknights-infra-telemetry-session"));

  await expect(page.locator("[data-plan-board]")).toHaveAttribute("data-plan-revision", diagnosticId);
  await page.locator("[data-calculator-more-tools]").getByText("更多工具", { exact: true }).click();
  await page.locator("[data-calculator-more-tools]").getByRole("button", { name: "配置Box与布局" }).click();
  await page.getByRole("dialog").getByRole("button", { name: /第 1 步，共 3 步：干员数据/ }).click();
  await page.getByText("数据管理", { exact: true }).click();
  const storageCopy = page.getByText("数据在此浏览器保存 30 天。", { exact: true });
  await storageCopy.scrollIntoViewIfNeeded();
  await expect(storageCopy).toBeVisible();
  await page.getByRole("button", { name: "清除本地数据" }).first().click();
  const clearDialog = page.getByRole("dialog", { name: "清除本地数据？" });
  await expect(clearDialog).toBeVisible();
  await expectUnifiedDialogTypography(clearDialog, "24px");
  await expectUnifiedDialogAction(clearDialog.getByRole("button", { name: "保留数据" }), { height: "44px" });
  await expectUnifiedDialogAction(clearDialog.getByRole("button", { name: "清除本地数据" }), { width: "176px", height: "44px" });
  await page.getByRole("button", { name: "清除本地数据" }).last().click();

  const stored = await page.evaluate(() => ({
    v2: window.localStorage.getItem("arknights-infra-calc-beta-session-v2"),
    v3: window.localStorage.getItem("arknights-infra-calc-beta-session-v3"),
    v4: window.localStorage.getItem("arknights-infra-calc-session-v4"),
    v5: window.localStorage.getItem("arknights-infra-calc-session-v5"),
    telemetry: window.localStorage.getItem("arknights-infra-telemetry-session"),
    onboarding: window.localStorage.getItem("arknights-infra-calc-beta-onboarding-v1"),
  }));
  expect({ ...stored, telemetry: undefined }).toEqual({ v2: null, v3: null, v4: null, v5: null, telemetry: undefined, onboarding: null });
  expect(stored.telemetry).not.toBe(telemetrySessionBeforeClear);
  expect(logoutRequests).toBe(0);
});
