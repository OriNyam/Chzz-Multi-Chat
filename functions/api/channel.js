import { upstreamJson } from "./chat.js";

export async function onRequestGet({ request }) {
  const id = new URL(request.url).searchParams.get("channelId") || "";
  if (!/^[a-f0-9]{32}$/i.test(id)) {
    return Response.json({ message: "채널 ID를 확인해 주세요." }, { status: 400 });
  }
  try {
    const channel = await upstreamJson(`https://api.chzzk.naver.com/service/v1/channels/${id}`);
    return Response.json({
      name: channel.channelName,
      image: channel.channelImageUrl || "",
      live: channel.openLive === true
    }, { headers: { "Cache-Control": "public, max-age=30" } });
  } catch {
    return Response.json({ message: "채널 정보를 불러오지 못했습니다." }, {
      status: 502, headers: { "Cache-Control": "no-store" }
    });
  }
}
