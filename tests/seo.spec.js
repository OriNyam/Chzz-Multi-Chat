import { test, expect } from "@playwright/test";

test("public discovery metadata and sitemap consistently identify the chat viewer", async ({ page, request }) => {
  const canonical = "https://chzz-multi-chat.pages.dev/";
  const response = await page.goto("/");
  expect(response.status()).toBe(200);
  await expect(page).toHaveTitle("치지직 채팅창 모아보기 | CHZZK Multi Chat");
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", canonical);
  await expect(page.locator('meta[property="og:url"]')).toHaveAttribute("content", canonical);
  const description = await page.locator('meta[name="description"]').getAttribute("content");
  expect(description).toContain("치지직 방송의 실시간 채팅창");
  for (const selector of ['meta[property="og:description"]', 'meta[name="twitter:description"]']) {
    await expect(page.locator(selector)).toHaveAttribute("content", description);
  }
  const data = JSON.parse(await page.locator('script[type="application/ld+json"]').textContent());
  expect(data).toMatchObject({ "@type": "WebSite", name: "치지직 채팅창 모아보기", url: canonical, description });
  const robots = await request.get("/robots.txt");
  expect(robots.status()).toBe(200);
  expect(robots.headers()["content-type"]).toContain("text/plain");
  expect(await robots.text()).toContain(`Sitemap: ${canonical}sitemap.xml`);
  expect(await robots.text()).toContain("Disallow: /api/");
  const sitemap = await request.get("/sitemap.xml");
  expect(sitemap.status()).toBe(200);
  expect(sitemap.headers()["content-type"]).toContain("xml");
  const parsed = await page.evaluate(xml => {
    const document = new DOMParser().parseFromString(xml, "application/xml");
    return { error: Boolean(document.querySelector("parsererror")), urls: [...document.querySelectorAll("loc")].map(el => el.textContent) };
  }, await sitemap.text());
  expect(parsed).toEqual({ error: false, urls: [canonical] });
});
