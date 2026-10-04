import { expect, test } from "@playwright/test";

test("gallery uses direct GPU rendering or responsive software fallback, sleeps and restores WebGL", async ({ page }) => {
  test.setTimeout(120_000);
  // This exercises GPU lifecycle/scheduling, not screenshot fidelity. Keep its
  // software-GPU workload small; plush-details covers full desktop/mobile size.
  await page.setViewportSize({ width: 256, height: 384 });
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.addInitScript(() => {
    const state = { copies: 0, gl: null as WebGL2RenderingContext | null };
    Object.assign(window, { plushRendering: state });
    const getContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, ...args: Parameters<typeof getContext>) {
      const context = getContext.apply(this, args);
      if (args[0] === "webgl2") state.gl = context as WebGL2RenderingContext;
      return context;
    } as typeof getContext;
    const original = CanvasRenderingContext2D.prototype.drawImage;
    CanvasRenderingContext2D.prototype.drawImage = function (this: CanvasRenderingContext2D, ...args: Parameters<typeof original>) {
      if (args[0] instanceof HTMLCanvasElement) state.copies++;
      return original.apply(this, args);
    } as typeof original;
  });
  await page.route("**/api/telemetry", route => route.fulfill({ json: { success: true } }));
  await page.goto("/plush?debug=1");
  const avatar = page.locator('[data-fur-avatar="closure"]');
  await expect(avatar).toHaveAttribute("data-fur-ready", "true", { timeout: 30_000 });
  await expect(avatar).toHaveAttribute("data-fur-shells", "64");
  await expect(avatar).toHaveAttribute("data-fur-fps", "60");
  const frames = async () => Number(await avatar.getAttribute("data-fur-frames"));
  const start = await frames();
  await expect.poll(frames, { timeout: 20_000 }).toBeGreaterThan(start + 3);
  const copies = await page.evaluate(() => (window as unknown as { plushRendering: { copies: number } }).plushRendering.copies);
  if (await avatar.getAttribute("data-fur-renderer") === "webgl") expect(copies).toBe(0);
  else {
    await expect(avatar).toHaveAttribute("data-fur-renderer", "software-2d");
    expect(copies).toBeGreaterThan(3);
  }

  await page.getByText("更多设置", { exact: true }).click();
  await page.getByLabel("持续动画", { exact: true }).uncheck();
  await expect(avatar).toHaveAttribute("data-fur-motion", "idle", { timeout: 20_000 });
  const resting = await frames();
  await page.waitForTimeout(1200);
  expect(await frames()).toBe(resting);

  // Losing and restoring the actual context must rebuild programs and wake an
  // otherwise idle gallery, without reloading or creating another canvas.
  await page.evaluate(() => {
    const gl = (window as unknown as { plushRendering: { gl: WebGL2RenderingContext } }).plushRendering.gl;
    const extension = gl.getExtension("WEBGL_lose_context")!;
    gl.canvas.addEventListener("webglcontextlost", () => setTimeout(() => extension.restoreContext(), 100), { once: true });
    extension.loseContext();
  });
  await expect.poll(frames, { timeout: 30_000 }).toBeGreaterThan(resting);
  await expect(avatar).toHaveAttribute("data-fur-ready", "true");
  await expect(page.locator("main canvas")).toHaveCount(1);
  await page.getByLabel("持续动画", { exact: true }).check();
  const resumed = await frames();
  await expect.poll(frames, { timeout: 20_000 }).toBeGreaterThan(resumed + 3);
});

test("slow GPU motion samples fewer pixels and restores the full authored quality", async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 400, height: 540 });
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.addInitScript(() => {
    // Deterministic GPU backpressure, without lowering any scene quality.
    const waits = new WeakMap<WebGLSync, number>();
    const original = WebGL2RenderingContext.prototype.clientWaitSync;
    WebGL2RenderingContext.prototype.clientWaitSync = function (sync, flags, timeout) {
      if (!waits.has(sync)) waits.set(sync, performance.now());
      if (performance.now() - waits.get(sync)! < 50) return this.TIMEOUT_EXPIRED;
      return original.call(this, sync, flags, timeout);
    };
  });
  await page.route("**/api/telemetry", route => route.fulfill({ json: { success: true } }));
  await page.goto("/plush?debug=1");
  const avatar = page.locator('[data-fur-avatar="closure"]');
  await expect(avatar).toHaveAttribute("data-fur-ready", "true", { timeout: 30_000 });
  await page.getByText("更多设置", { exact: true }).click();
  await page.getByLabel("持续动画", { exact: true }).uncheck();
  await page.getByText("更多设置", { exact: true }).click();
  await expect(avatar).toHaveAttribute("data-fur-motion", "idle", { timeout: 20_000 });
  const fullPixels = Number(await avatar.getAttribute("data-fur-pixels"));
  const bounds = await avatar.boundingBox();
  await page.mouse.move(bounds!.x + bounds!.width / 2, bounds!.y + bounds!.height / 2);
  await page.mouse.down();
  await expect.poll(async () => Number(await avatar.getAttribute("data-fur-resolution-scale")), { timeout: 15_000 }).toBeLessThan(1);
  expect(Number(await avatar.getAttribute("data-fur-pixels"))).toBeLessThan(fullPixels);
  await expect(avatar).toHaveAttribute("data-fur-shells", "64");
  await page.mouse.up();
  await expect(avatar).toHaveAttribute("data-fur-motion", "idle", { timeout: 20_000 });
  await expect(avatar).toHaveAttribute("data-fur-resolution-scale", "1.00");
  await expect(avatar).toHaveAttribute("data-fur-pixels", String(fullPixels));
});
