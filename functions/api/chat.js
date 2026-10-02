const HEADERS = {
  "User-Agent": "Mozilla/5.0",
  Accept: "application/json",
  Origin: "https://chzzk.naver.com",
  Referer: "https://chzzk.naver.com/"
};

export async function upstreamJson(url) {
  const response = await fetch(url, {
    headers: HEADERS,
    signal: AbortSignal.timeout(8000)
  });
  if (!response.ok) throw new Error("upstream rejected request");
  const payload = await response.json();
  if (payload.code !== 200 || !payload.content) throw new Error("invalid upstream response");
  return payload.content;
}

export async function onRequestGet({ request }) {
  const channelId = new URL(request.url).searchParams.get("channelId") || "";
  const respond = (body, status = 200) => Response.json(body, {
    status, headers: { "Cache-Control": "no-store" }
  });
  if (!/^[a-f0-9]{32}$/i.test(channelId)) return respond({ message: "채널 ID를 확인해 주세요." }, 400);
  try {
    const live = await upstreamJson(`https://api.chzzk.naver.com/polling/v2/channels/${channelId}/live-status`);
    if (!live.chatChannelId) return respond({ state: "waiting" });
    if (new URL(request.url).searchParams.get("status") === "1") {
      return respond({ chatChannelId: live.chatChannelId });
    }
    const token = await upstreamJson(`https://comm-api.game.naver.com/nng_main/v1/chats/access-token?channelId=${encodeURIComponent(live.chatChannelId)}&chatType=STREAMING`);
    if (!token.accessToken) throw new Error("missing read token");
    // No viewer cookies are forwarded; this token is only used for anonymous READ connections.
    return respond({ chatChannelId: live.chatChannelId, accessToken: token.accessToken });
  } catch {
    return respond({ message: "채팅에 연결하지 못했습니다. 자동으로 다시 시도합니다." }, 502);
  }
}
