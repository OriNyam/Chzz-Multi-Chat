import { test, expect } from "@playwright/test";

const channel = { id: "a".repeat(32), name: "테스트 채널", selected: true };
const profile = { userIdHash: "user", nickname: "구독자", streamingProperty: {
  subscription: { accumulativeMonth: 9, tier: 2, tierName: "구독", badge: { imageUrl: "https://nng-phinf.pstatic.net/badge.png" } },
  nicknameColor: { colorCode: "SG004" }
} };
const message = (time, text = "안녕하세요") => ({ profile: JSON.stringify(profile), uid: "user", msgTime: time, msgTypeCode: 1, msg: text, extras: JSON.stringify({ emojis: { sub: "https://ssl.pstatic.net/emoji.gif" } }) });

test("read-only chat preserves layout, settings, badges, theme, scroll and connection lifecycle", async ({ page }) => {
  const sockets = [];
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.addInitScript(ch => localStorage.setItem("chzzk_multi_chat_channels", JSON.stringify([ch, { ...ch, id: "b".repeat(32), name: "두 번째 채널" }])), channel);
  await page.route("**/api/chat?*", route => route.fulfill({ json: { chatChannelId: "room", accessToken: "test" } }));
  await page.route("**/api/channel?*", route => route.fulfill({ json: { live: false } }));
  await page.route("**/api/chat-colors", route => route.fulfill({ status: 502, json: { colors: [] } }));
  await page.route("https://*.pstatic.net/**", route => route.fulfill({ contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"><rect width="20" height="20" fill="green"/></svg>' }));
  await page.routeWebSocket(/chat\.naver\.com/, socket => {
    sockets.push(socket);
    socket.onMessage(raw => {
      const packet = JSON.parse(raw);
      expect(packet.cmd).not.toBe(3101);
      if (packet.cmd === 100) {
        expect(packet.bdy.auth).toBe("READ"); expect(packet.bdy.uid).toBeNull();
        socket.send(JSON.stringify({ cmd: 10100, retCode: 0, bdy: { sid: "test" } }));
      }
      if (packet.cmd === 5101) socket.send(JSON.stringify({ cmd: 15101, bdy: { messageList: Array.from({ length: 50 }, (_, i) => message(i, `채팅 ${i} {:sub:}`)) } }));
    });
  });
  await page.goto("/");
  const card = page.locator(".chat").first();
  await expect(card.locator(".chat-message")).toHaveCount(50);
  await expect(card.locator(".gradient").first()).toHaveCSS("color", "rgba(0, 0, 0, 0)");
  await expect(card.locator(".chat-badge").first()).toHaveAttribute("title", "구독 · 9개월");
  expect(await page.locator("iframe").count()).toBe(0);
  sockets[0].send(JSON.stringify({ cmd: 93101, bdy: [message(49, "채팅 49 {:sub:}"), message(50, '<img src=x onerror=alert(1)>')] }));
  await expect(card.locator(".chat-message")).toHaveCount(51);
  await expect(card.locator(".chat-message").last()).toContainText("<img src=x onerror=alert(1)>");
  expect(await card.locator("img[src=x]").count()).toBe(0);
  sockets[0].send(JSON.stringify({ cmd: 94008, bdy: { messageTime: 50, userId: "user" } }));
  await expect(card.locator(".chat-message").last()).toHaveText("삭제된 메시지입니다.");
  await card.locator(".chat-messages").evaluate(el => { el.scrollTop = 0; el.dispatchEvent(new Event("scroll")); });
  sockets[0].send(JSON.stringify({ cmd: 93101, bdy: [message(51)] }));
  await expect(card.locator(".chat-latest")).toBeVisible();
  await card.locator(".chat-latest").click();
  await expect(card.locator(".chat-latest")).toBeHidden();
  await page.mouse.move(2, 200);
  await page.locator("#theme-toggle").click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.locator("#width-input").fill("420");
  await page.locator("#height-input").fill("700");
  await page.locator("#scale-input").fill("1.3");
  await expect(card).toHaveCSS("width", "420px");
  await expect(card.locator(".chat-messages")).toHaveCSS("font-size", "18.2px");
  const before = sockets.length;
  await page.locator(".channel-item input").last().uncheck();
  await expect(page.locator(".chat")).toHaveCount(1);
  expect(sockets.length).toBe(before);
  await page.evaluate(() => window.dispatchEvent(new Event("blur")));
  await expect(page.locator("#sidebar")).toHaveClass(/collapsed/);
  const handle = await card.locator(".chat-resizer").boundingBox();
  await page.mouse.move(handle.x + 8, handle.y + 8);
  await page.mouse.down(); await page.mouse.move(handle.x + 48, handle.y + 38); await page.mouse.up();
  await expect(card).toHaveCSS("width", "460px");
  expect(JSON.parse(await page.evaluate(() => localStorage.getItem("chzzk_multi_chat_config"))).width).toBe(460);
  await card.getByTitle("이 채팅만 새로고침").click();
  await expect(card.locator(".chat-message")).toHaveCount(50);
  expect(sockets.length).toBe(before + 1);
  sockets.at(-1).close();
  await expect(card.locator(".chat-connection")).toContainText("다시 연결");
  await expect.poll(() => sockets.length, { timeout: 10000 }).toBe(before + 2);
  await expect(card.locator(".chat-message")).toHaveCount(50);
  sockets.at(-1).send(JSON.stringify({ cmd: 93101, bdy: Array.from({ length: 600 }, (_, i) => message(1000 + i)) }));
  await expect(card.locator(".chat-message")).toHaveCount(500);
  await page.screenshot({ path: ".wrangler/chat-light.png" });
  expect(errors).toEqual([]);
});
