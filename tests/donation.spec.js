import { test, expect } from "@playwright/test";

test("donations render as purple cards with a cheese amount and retain moderation and safe text", async ({ page }) => {
  const channel = { id: "a".repeat(32), name: "후원 표시 테스트", selected: true };
  await page.addInitScript(channel => {
    localStorage.setItem("chzzk_multi_chat_channels", JSON.stringify([channel]));
    localStorage.setItem("chzzk_multi_chat_config", JSON.stringify({ width: 520, height: 640, scale: 1.5 }));
  }, channel);
  await page.route("**/api/channel?*", route => route.fulfill({ json: { live: false } }));
  await page.route("**/api/chat?*", route => route.fulfill({ json: { chatChannelId: "room", accessToken: "test" } }));
  await page.route("**/api/chat-colors", route => route.fulfill({ json: { colors: [] } }));
  const messages = [
    { uid: "one", msgTime: 1, msgTypeCode: 1, profile: JSON.stringify({ nickname: "시청자" }), msg: "일반 채팅입니다" },
    { uid: "donor", msgTime: 2, msgTypeCode: 10, profile: "{}", extras: JSON.stringify({ payAmount: 1000 }), msg: "자꾸 치 치 치 거리는게 치즈달라는 신호인가?" },
    { uid: "two", msgTime: 3, msgTypeCode: 1, profile: JSON.stringify({ nickname: "다른 시청자" }), msg: "후원 카드 아래의 일반 채팅" },
    { uid: "sub", msgTime: 4, msgTypeCode: 11, profile: JSON.stringify({ nickname: "구독자" }), extras: JSON.stringify({ month: 3 }), msg: "구독 알림" }
  ];
  let socket;
  await page.routeWebSocket(/chat\.naver\.com/, route => {
    socket = route;
    route.onMessage(raw => {
      const packet = JSON.parse(raw);
      if (packet.cmd === 100) route.send(JSON.stringify({ cmd: 10100, retCode: 0, bdy: { sid: "test" } }));
      if (packet.cmd === 5101) route.send(JSON.stringify({ cmd: 15101, bdy: { messageList: messages } }));
    });
  });
  await page.goto("/");
  const card = page.locator(".donation");
  await expect(card).toHaveCount(1);
  await expect(card.locator(".donation-name")).toHaveText("익명의 후원자");
  await expect(card.locator(".donation-message")).toHaveText(messages[1].msg);
  await expect(card.locator(".donation-amount")).toHaveAttribute("aria-label", "1,000 치즈");
  await expect(card).toHaveCSS("background-color", "rgb(87, 76, 165)");
  await expect(card).toHaveCSS("color", "rgb(255, 255, 255)");
  await expect(card.locator(".chat-nickname")).toHaveCount(0);
  await expect(page.locator(".subscription")).toContainText("3개월 구독");
  await page.screenshot({ path: ".wrangler/donation-dark.png" });
  await page.mouse.move(40, 200);
  await page.locator("#theme-toggle").click();
  await page.mouse.move(800, 200);
  await expect(card).toHaveCSS("color", "rgb(255, 255, 255)");
  await page.screenshot({ path: ".wrangler/donation-light.png" });
  socket.send(JSON.stringify({ cmd: 93101, bdy: [{ uid: "donor2", msgTime: 5, msgTypeCode: 10,
    profile: JSON.stringify({ nickname: "후원자", streamingProperty: { nicknameColor: { colorCode: "SG004" } } }),
    extras: JSON.stringify({ payAmount: 10000 }), msg: "<img src=x onerror=alert(1)>\n긴 후원 메시지 ".repeat(8) }] }));
  const latest = card.last();
  await expect(latest.locator(".donation-name")).toHaveText("후원자");
  await expect(latest.locator(".donation-amount")).toHaveAttribute("aria-label", "10,000 치즈");
  await expect(latest.locator("img")).toHaveCount(0);
  await page.mouse.move(40, 200);
  await page.locator("#width-range").fill("240");
  await page.mouse.move(800, 200);
  expect(await latest.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
  socket.send(JSON.stringify({ cmd: 94008, bdy: { messageTime: 5, userId: "donor2" } }));
  await expect(page.locator(".chat-message").last()).toHaveClass("chat-message blind");
  await expect(page.locator(".chat-message").last()).toHaveText("삭제된 메시지입니다.");
});
