import { upstreamJson } from "./chat.js";

export async function onRequestGet() {
  try {
    const content = await upstreamJson("https://api.chzzk.naver.com/service/v2/nickname/color/codes");
    if (!Array.isArray(content.codeList)) throw new Error("invalid color list");
    return Response.json({ colors: content.codeList }, {
      headers: { "Cache-Control": "public, max-age=3600" }
    });
  } catch {
    return Response.json({ colors: [] }, { status: 502, headers: { "Cache-Control": "no-store" } });
  }
}
