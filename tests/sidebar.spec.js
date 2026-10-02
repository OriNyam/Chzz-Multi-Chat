import { test, expect } from "@playwright/test";

test("sidebar closes immediately even with focus and stays open across the hotspot boundary", async ({ page }) => {
  await page.goto("/");
  const sidebar = page.locator("#sidebar");
  const collapsed = () => sidebar.evaluate(el => el.classList.contains("collapsed"));
  for (const y of [40, 200, 850]) {
    await page.mouse.move(700, y);
    await page.mouse.move(40, y);
    expect(await collapsed()).toBe(false);
    for (const x of [47, 49, 2, 100, 359, 40]) {
      await page.mouse.move(x, y);
      expect(await collapsed()).toBe(false);
    }
    await page.waitForTimeout(500);
    expect(await collapsed()).toBe(false);
    await page.mouse.move(700, y);
    expect(await collapsed()).toBe(true);
    expect((await sidebar.boundingBox()).x + (await sidebar.boundingBox()).width).toBeLessThanOrEqual(0);
  }
  await page.mouse.move(2, 200);
  await page.locator("#search-input").click({ position: { x: 12, y: 12 } });
  await expect(page.locator("#search-input")).toBeFocused();
  await page.locator("#search-input").fill("냐미");
  await page.mouse.move(700, 200);
  expect(await collapsed()).toBe(true);
  await expect(page.locator("#search-input")).not.toBeFocused();
  await page.mouse.move(2, 40);
  await page.locator("#sidebar-toggle").click();
  expect(await collapsed()).toBe(true);
  await page.mouse.move(2, 200);
  await page.evaluate(() => window.dispatchEvent(new Event("blur")));
  expect(await collapsed()).toBe(true);
  await page.mouse.move(700, 200);
  await page.locator("#search-input").focus();
  expect(await collapsed()).toBe(false);
  await page.keyboard.press("Tab");
  expect(await collapsed()).toBe(false);
  await page.locator("#search-button").blur();
  expect(await collapsed()).toBe(true);
});

test("long channel lists scroll independently of settings and integer size displays persist", async ({ page }) => {
  await page.addInitScript(() => {
    if (!localStorage.getItem("chzzk_multi_chat_channels")) {
      localStorage.setItem("chzzk_multi_chat_channels", JSON.stringify(Array.from({ length: 30 }, (_, index) => ({
        id: index.toString(16).padStart(32, "0"), name: `테스트 채널 ${index + 1}`, selected: index === 0
      }))));
      localStorage.setItem("chzzk_multi_chat_config", JSON.stringify({ width: 360.25, height: 640.75, scale: 1 }));
    }
  });
  await page.route("**/api/channel?*", route => route.fulfill({ json: { live: false } }));
  await page.route("**/api/chat?*", route => route.fulfill({ json: { state: "waiting" } }));
  await page.route("**/api/chat-colors", route => route.fulfill({ json: { colors: [] } }));
  await page.goto("/");
  await page.mouse.move(2, 200);
  await expect(page.locator("#sidebar")).not.toHaveClass(/collapsed/);
  await expect(page.locator(".channel-item")).toHaveCount(30);
  await expect(page.locator("#width-value")).toHaveText("360");
  await expect(page.locator("#height-value")).toHaveText("641");
  await expect(page.locator("#width-value")).toHaveCSS("user-select", "none");
  await expect(page.locator("#height-value")).toHaveCSS("user-select", "none");
  await expect(page.locator("#scale-value")).toHaveCSS("user-select", "none");
  await expect(page.locator('input[type="number"]')).toHaveCount(0);
  expect(await page.locator("#width-value").evaluate(el => el.tagName === "OUTPUT" && !el.isContentEditable)).toBe(true);

  for (const viewport of [{ width: 1280, height: 900 }, { width: 1280, height: 420 }, { width: 380, height: 480 }]) {
    await page.setViewportSize(viewport);
    await page.mouse.move(2, 100);
    await page.locator("#width-range").focus();
    const settings = page.locator(".sidebar-settings");
    await expect(settings).toBeInViewport({ ratio: 1 });
    await expect(page.locator("#reset")).toBeInViewport({ ratio: 1 });
    const before = await settings.boundingBox();
    const scroll = page.locator(".sidebar-scroll");
    await scroll.evaluate(el => { el.scrollTop = el.scrollHeight; });
    await expect(page.locator(".channel-item").last()).toBeInViewport({ ratio: 1 });
    expect(await scroll.evaluate(el => el.scrollTop)).toBeGreaterThan(0);
    expect((await settings.boundingBox()).y).toBe(before.y);
    expect(await settings.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
    await page.screenshot({ path: `.wrangler/sidebar-${viewport.width}-${viewport.height}.png` });
  }

  await page.locator("#width-range").fill("427");
  await page.locator("#height-range").fill("715");
  await page.locator("#scale-input").fill("1.2");
  await expect(page.locator("#width-value")).toHaveText("427");
  await expect(page.locator("#height-value")).toHaveText("715");
  await expect(page.locator("#scale-value")).toHaveText("120");
  await page.locator("#width-range").focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.locator("#width-value")).toHaveText("428");
  await page.locator("#theme-toggle").click();
  await page.screenshot({ path: ".wrangler/sidebar-compact-light.png" });
  await page.reload();
  await expect(page.locator("#width-range")).toHaveValue("428");
  await expect(page.locator("#height-range")).toHaveValue("715");
  await expect(page.locator("#scale-value")).toHaveText("120");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
});
