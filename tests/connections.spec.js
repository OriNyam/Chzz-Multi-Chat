import { test, expect } from "@playwright/test";

async function mockChat(page) {
  const sockets = [];
  const requests = [];
  await page.route("**/api/channel?*", route => route.fulfill({ json: { live: false } }));
  await page.route("**/api/chat-colors", route => route.fulfill({ json: { colors: [] } }));
  await page.route("**/api/chat?*", route => {
    requests.push(route.request().url());
    return route.fulfill({ json: { chatChannelId: new URL(route.request().url()).searchParams.get("channelId"), accessToken: "test" } });
  });
  await page.routeWebSocket(/chat\.naver\.com/, socket => {
    const entry = { socket, closed: false, packets: 0 };
    sockets.push(entry);
    socket.onClose(() => { entry.closed = true; });
    socket.onMessage(raw => {
      const packet = JSON.parse(raw);
      entry.packets++;
      entry.id = packet.cid;
      if (packet.cmd === 100) socket.send(JSON.stringify({ cmd: 10100, retCode: 0, bdy: { sid: "test" } }));
      if (packet.cmd === 0) socket.send(JSON.stringify({ cmd: 0 }));
      if (packet.cmd === 5101) socket.send(JSON.stringify({ cmd: 15101, bdy: { messageList: [{ uid: "viewer", msgTime: 1, msg: "유지된 채팅", profile: JSON.stringify({ nickname: "시청자" }) }] } }));
    });
  });
  return { sockets, requests };
}

test("many channels reuse connections within three seconds and fully disconnect after removal", async ({ page }) => {
  await page.clock.install();
  await page.clock.pauseAt(new Date());
  const ids = Array.from({ length: 12 }, (_, i) => (i + 1).toString(16).padStart(32, "0"));
  await page.addInitScript(ids => localStorage.setItem("chzzk_multi_chat_channels", JSON.stringify(ids.map((id, i) => ({ id, name: `채널 ${i}`, selected: true })))), ids);
  const { sockets, requests } = await mockChat(page);
  await page.goto("/");
  await expect(page.locator(".chat-message")).toHaveCount(12);
  expect(sockets).toHaveLength(12);
  const originalBounds = await page.locator(".chat").first().boundingBox();
  await page.mouse.move(40, 200);
  expect(await page.locator(".chat").first().boundingBox()).toEqual(originalBounds);
  await page.screenshot({ path: ".wrangler/sidebar-overlay.png" });
  const first = page.locator(`.channel-item[data-channel-id="${ids[0]}"] input`);
  await first.uncheck();
  await expect(page.locator(".chat")).toHaveCount(11);
  await page.clock.runFor(2999);
  expect(sockets.filter(s => s.closed)).toHaveLength(0);
  await first.check();
  await page.clock.runFor(2);
  expect(sockets).toHaveLength(12);
  await expect(page.locator(".chat-message")).toHaveCount(12);
  expect(sockets.filter(s => s.closed)).toHaveLength(0);

  // Repeated unrelated renders must not extend the original disconnect deadline.
  await first.uncheck();
  await page.clock.runFor(2000);
  await page.locator(`.channel-item[data-channel-id="${ids[1]}"] input`).uncheck();
  await page.clock.runFor(1000);
  await expect.poll(() => sockets.filter(s => s.closed).length).toBe(1);
  expect(sockets.find(s => s.id === ids[0]).closed).toBe(true);
  await first.check();
  await expect.poll(() => sockets.length).toBe(13);

  // Removing and adding the same channel also cancels its pending disconnect.
  await page.locator(`.channel-item[data-channel-id="${ids[0]}"]`).getByTitle("채널 삭제").click();
  await page.locator("summary").click();
  await page.locator("#manual-input").fill(ids[0]);
  await page.locator("#manual-button").click();
  expect(sockets).toHaveLength(13);
  await page.clock.runFor(3000);
  await expect.poll(() => sockets.filter(s => s.closed).length).toBe(2);
  await expect(page.locator(".chat")).toHaveCount(11);

  while (await page.locator(".channel-item").count()) {
    await page.locator(".channel-item").first().getByTitle("채널 삭제").click();
  }
  await expect(page.locator(".chat")).toHaveCount(0);
  const requestCount = requests.length;
  await page.locator("#refresh-all").click();
  expect(requests).toHaveLength(requestCount);
  await page.clock.runFor(2999);
  expect(sockets.filter(s => !s.closed)).toHaveLength(11);
  await page.clock.runFor(1);
  await expect.poll(() => sockets.every(s => s.closed)).toBe(true);
  const packetCount = sockets.reduce((sum, s) => sum + s.packets, 0);
  await page.clock.runFor(120000);
  await page.evaluate(() => {
    window.dispatchEvent(new Event("online"));
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await page.clock.runFor(60000);
  expect(sockets).toHaveLength(13);
  expect(requests).toHaveLength(requestCount);
  expect(sockets.reduce((sum, s) => sum + s.packets, 0)).toBe(packetCount);
});

test("disposing aborts pending metadata and poll requests and cancels retries", async ({ page }) => {
  await page.clock.install();
  await page.clock.pauseAt(new Date());
  const { sockets } = await mockChat(page);
  await page.goto("/");
  await page.evaluate(async () => {
    const { ChatView } = await import("/chat.js");
    window.testView = new ChatView({ id: "a".repeat(32), name: "테스트" });
  });
  await expect.poll(() => sockets.length).toBe(1);
  await expect.poll(() => page.evaluate(() => window.testView.status.hidden)).toBe(true);
  await page.evaluate(() => {
    const originalFetch = window.fetch;
    window.pendingSignals = [];
    window.fetch = (url, options) => {
      if (String(url).startsWith("/api/chat?")) {
        window.pendingSignals.push(options.signal);
        return new Promise((resolve, reject) => options.signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true }));
      }
      return originalFetch(url, options);
    };
  });
  await page.clock.runFor(60000);
  await expect.poll(() => page.evaluate(() => window.pendingSignals.length)).toBe(1);
  await page.evaluate(() => window.testView.dispose());
  expect(await page.evaluate(() => window.pendingSignals.every(signal => signal.aborted))).toBe(true);
  await expect.poll(() => sockets[0].closed).toBe(true);
  await page.evaluate(async () => {
    const { ChatView } = await import("/chat.js");
    window.testView = new ChatView({ id: "b".repeat(32), name: "연결 대기" });
    window.testView.dispose();
  });
  expect(await page.evaluate(() => window.pendingSignals.length)).toBe(2);
  expect(await page.evaluate(() => window.pendingSignals.every(signal => signal.aborted))).toBe(true);
  await page.evaluate(async () => {
    const { ChatView } = await import("/chat.js");
    window.testView = new ChatView({ id: "c".repeat(32), name: "재시도 대기" });
    window.testView.retry("재시도", 1000);
    window.testView.dispose();
    window.dispatchEvent(new Event("online"));
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await page.clock.runFor(120000);
  expect(await page.evaluate(() => window.pendingSignals.length)).toBe(3);
  expect(await page.evaluate(() => window.pendingSignals.every(signal => signal.aborted))).toBe(true);
  expect(sockets).toHaveLength(1);
});
