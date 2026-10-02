import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { imageUrl, nicknameStyle, badges, messageKey } from "../public/chat.js";
import { onRequestGet } from "../functions/api/chat.js";

const table = JSON.parse(await readFile(new URL("../public/chat-colors.json", import.meta.url))).colors;

test("nickname colors preserve user selection, gradient and theme variants", () => {
  const profile = { userIdHash: "user", streamingProperty: { nicknameColor: { colorCode: "SG004" } } };
  const style = nicknameStyle(profile, "room", table);
  assert.equal(style.effect, "GRADATION");
  assert.equal(style.dark, "#5DA8EC");
  assert.equal(style.endDark, "#D581FF");
  assert.notEqual(style.light, style.dark);
  assert.deepEqual(nicknameStyle({ userIdHash: "user" }, "room"), nicknameStyle({ userIdHash: "user" }, "room"));
  assert.notDeepEqual(nicknameStyle({ userIdHash: "user" }, "room"), nicknameStyle({ userIdHash: "another" }, "room"));
});

test("badges use the channel-specific subscription image and only active viewer badges", () => {
  const url = "https://nng-phinf.pstatic.net/glive/subscription/badge/channel/2/9.png";
  const result = badges({ streamingProperty: { subscription: { accumulativeMonth: 9, tierName: "구독", badge: { imageUrl: url } } }, viewerBadges: [
    { activatedV2: false, badge: { imageUrl: "https://ssl.pstatic.net/hidden.png" } },
    { activatedV2: true, badge: { imageUrl: "https://ssl.pstatic.net/active.png" } }
  ] });
  assert.equal(result[0].url, url);
  assert.match(result[0].title, /9개월/);
  assert.equal(result.length, 2);
  for (const bad of ["javascript:alert(1)", "https://pstatic.net.evil.test/img", "data:image/svg+xml,test"]) assert.equal(imageUrl(bad), "");
});

test("recent and realtime message variants deduplicate", () => {
  assert.equal(messageKey({ uid: "user", msgTime: 10, msgTypeCode: 1, msg: "hello" }), messageKey({ profile: JSON.stringify({ userIdHash: "user" }), messageTime: 10, messageTypeCode: 1, content: "hello" }));
});

test("connection API validates IDs, omits login cookies and handles waiting/upstream failure", async t => {
  const request = (query = "") => new Request(`https://test/api/chat?channelId=${"a".repeat(32)}${query}`, { headers: { Cookie: "private=must-not-forward" } });
  const calls = [];
  t.mock.method(globalThis, "fetch", async (url, options) => {
    calls.push({ url, options });
    return Response.json({ code: 200, content: calls.length === 1 ? { chatChannelId: "room" } : { accessToken: "anonymous", extraToken: "not-needed" } });
  });
  assert.equal((await onRequestGet({ request: new Request("https://test/api/chat?channelId=bad") })).status, 400);
  assert.equal(calls.length, 0);
  const response = await onRequestGet({ request: request() });
  assert.deepEqual(await response.json(), { chatChannelId: "room", accessToken: "anonymous" });
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(new Headers(calls[0].options.headers).has("cookie"), false);
  calls.length = 0;
  assert.deepEqual(await (await onRequestGet({ request: request("&status=1") })).json(), { chatChannelId: "room" });
  assert.equal(calls.length, 1);
  globalThis.fetch = async () => Response.json({ code: 200, content: { chatChannelId: null } });
  assert.deepEqual(await (await onRequestGet({ request: request() })).json(), { state: "waiting" });
  globalThis.fetch = async () => { throw new Error("upstream secret should not leak"); };
  const failure = await onRequestGet({ request: request() });
  assert.equal(failure.status, 502);
  assert.doesNotMatch(await failure.text(), /secret/);
});
