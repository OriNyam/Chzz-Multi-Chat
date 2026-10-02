import test from "node:test";
import assert from "node:assert/strict";
import { onRequestGet } from "../functions/api/channel.js";

test("channel metadata validates IDs and returns profile and live state without followers", async t => {
  const upstream = t.mock.method(globalThis, "fetch", async () => Response.json({ code: 200, content: { channelName: "채널", channelImageUrl: "https://ssl.pstatic.net/avatar.png", openLive: true, followerCount: 123 } }));
  assert.equal((await onRequestGet({ request: new Request("https://test/api/channel?channelId=bad") })).status, 400);
  assert.equal(upstream.mock.callCount(), 0);
  const result = await onRequestGet({ request: new Request(`https://test/api/channel?channelId=${"a".repeat(32)}`) });
  assert.deepEqual(await result.json(), { name: "채널", image: "https://ssl.pstatic.net/avatar.png", live: true });
  assert.equal(result.headers.get("cache-control"), "public, max-age=30");
});
