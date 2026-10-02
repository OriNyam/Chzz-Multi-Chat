import { test, expect } from "@playwright/test";

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
