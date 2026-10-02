const DARK = "#EEA05D.#EAA35F.#E98158.#E97F58.#E76D53.#E66D5F.#E16490.#E481AE.#E481AE.#D25FAC.#D263AE.#D66CB4.#D071B6.#AF71B5.#A96BB2.#905FAA.#B38BC2.#9D78B8.#8D7AB8.#7F68AE.#9F99C8.#717DC6.#7E8BC2.#5A90C0.#628DCC.#81A1CA.#ADD2DE.#83C5D6.#8BC8CB.#91CBC6.#83C3BB.#7DBFB2.#AAD6C2.#84C194.#92C896.#94C994.#9FCE8E.#A6D293.#ABD373.#BFDE73".split(".");
const LIGHT = "#EB8644.#EB8140.#E8673E.#E9582F.#E84E2D.#E75036.#E0334B.#DE355C.#D22D50.#D02C74.#C22A88.#C1449D.#B44BA2.#9836B8.#842EAA.#6E21B9.#7A30B6.#7B40BE.#6433C2.#5735B4.#4D40B6.#4659CF.#5166C8.#3188CB.#2269D0.#4183D7.#219FC7.#03A1CA.#25A1A7.#15978B.#10A391.#0B9F82.#0BB165.#228E4B.#149530.#098B16.#1C8B13.#2A9B12.#4C9F11.#5CA314".split(".");
const MAX_MESSAGES = 500;
let colorTable;
let freshColorTable;

export function object(value) {
  try {
    const parsed = typeof value === "string" ? JSON.parse(value) : value;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch { return {}; }
}

export function imageUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && (url.hostname === "pstatic.net" || url.hostname.endsWith(".pstatic.net")) ? url.href : "";
  } catch { return ""; }
}

function color(value, fallback) {
  return typeof value === "string" && /^#[a-f\d]{6}([a-f\d]{2})?$/i.test(value) ? value : fallback;
}

export function nicknameStyle(profile, chatChannelId, table = []) {
  const key = (profile.userIdHash || "") + chatChannelId;
  let hash = 0;
  for (let i = 0; i < key.length; i++) hash += key.charCodeAt(i);
  const fallback = { dark: color(profile.title?.color, DARK[hash % DARK.length]), light: color(profile.title?.color, LIGHT[hash % LIGHT.length]) };
  const code = profile.streamingProperty?.nicknameColor?.colorCode;
  const entry = table.find(item => item.code === code);
  if (!entry || profile.userRoleCode === "streamer" || profile.userRoleCode === "manager") return fallback;
  return {
    dark: color(entry.darkRgbValue, fallback.dark), light: color(entry.lightRgbValue, fallback.light),
    effect: entry.effectType,
    endDark: color(entry.effectValue?.darkRgbEndValue, fallback.dark),
    endLight: color(entry.effectValue?.lightRgbEndValue, fallback.light),
    bgDark: color(entry.effectValue?.darkRgbBackgroundValue, "#11191b"),
    bgLight: color(entry.effectValue?.lightRgbBackgroundValue, "#f3f8f6")
  };
}

export function badges(profile) {
  const items = [];
  const add = (badge, title) => {
    if (imageUrl(badge?.imageUrl)) items.push({ url: badge.imageUrl, title: title || badge.title || badge.name || "배지" });
  };
  add(profile.badge, profile.title?.name);
  add(profile.streamingProperty?.realTimeDonationRanking?.badge);
  const sub = profile.streamingProperty?.subscription;
  if (sub) add(sub.badge, `${sub.tierName || "구독"} · ${sub.accumulativeMonth || 1}개월`);
  if (Array.isArray(profile.viewerBadges) && profile.viewerBadges.length) {
    const list = profile.viewerBadges.filter(item => !("activatedV2" in item) || item.activatedV2);
    list.sort((a, b) => a.badge?.scope === b.badge?.scope ? (a.order || 0) - (b.order || 0) : a.badge?.scope === "CHANNEL" ? -1 : 1);
    list.forEach(item => add(item.badge));
  } else if (Array.isArray(profile.activityBadges)) {
    profile.activityBadges.filter(item => item.activated).forEach(item => add(item));
  }
  return items.slice(0, 12);
}

export function messageKey(message) {
  return `${message.uid || object(message.profile).userIdHash || ""}:${message.msgTime ?? message.messageTime}:${message.msgTypeCode ?? message.messageTypeCode}:${message.msg ?? message.content ?? ""}`;
}

async function colors() {
  if (!colorTable) colorTable = (async () => {
    // Ship the last verified palette so an optional API failure never blocks chat.
    const fallback = await fetch("/chat-colors.json").then(r => r.json()).catch(() => ({ colors: [] }));
    return Array.isArray(fallback.colors) ? fallback.colors : [];
  })();
  return colorTable;
}

function appendText(target, value, emojis = {}) {
  const text = String(value || "").slice(0, 10000);
  let offset = 0;
  for (const match of text.matchAll(/\{:([^{}\s]+):\}/g)) {
    target.append(document.createTextNode(text.slice(offset, match.index)));
    const url = imageUrl(emojis[match[1]]);
    if (url) {
      const img = document.createElement("img");
      img.className = "chat-emoji";
      img.src = url;
      img.alt = match[0];
      img.referrerPolicy = "no-referrer";
      img.addEventListener("error", () => img.replaceWith(document.createTextNode(match[0])), { once: true });
      target.append(img);
    } else target.append(document.createTextNode(match[0]));
    offset = match.index + match[0].length;
  }
  target.append(document.createTextNode(text.slice(offset)));
}

export class ChatView {
  constructor(channel) {
    this.channel = channel;
    this.generation = 0;
    this.retries = 0;
    this.records = [];
    this.seen = new Set();
    this.table = [];
    this.follow = true;
    this.element = document.createElement("div");
    this.element.className = "chat-body";
    this.messages = document.createElement("div");
    this.messages.className = "chat-messages";
    this.messages.setAttribute("role", "log");
    this.messages.setAttribute("aria-label", `${channel.name} 채팅`);
    this.messages.setAttribute("aria-live", "off");
    this.messages.tabIndex = 0;
    this.status = document.createElement("div");
    this.status.className = "chat-connection";
    this.status.setAttribute("role", "status");
    this.latest = document.createElement("button");
    this.latest.type = "button";
    this.latest.className = "chat-latest";
    this.latest.textContent = "최신 채팅 ↓";
    this.latest.hidden = true;
    this.notice = document.createElement("div");
    this.notice.className = "chat-notice";
    this.notice.hidden = true;
    this.element.append(this.messages, this.status, this.latest);
    this.latest.addEventListener("click", () => { this.follow = true; this.scrollToBottom(); });
    this.messages.addEventListener("scroll", () => {
      this.follow = this.messages.scrollHeight - this.messages.scrollTop - this.messages.clientHeight < 40;
      this.latest.hidden = this.follow;
    });
    this.element.addEventListener("load", () => { if (this.follow) this.scrollToBottom(); }, true);
    this.resizeObserver = new ResizeObserver(() => { if (this.follow) this.scrollToBottom(); });
    this.resizeObserver.observe(this.messages);
    colors().then(async table => {
      if (this.disposed) return;
      this.table = table; this.restyle();
      freshColorTable ??= fetch("/api/chat-colors", { signal: AbortSignal.timeout(10000) })
        .then(r => r.ok ? r.json() : null).catch(() => null);
      const data = await freshColorTable;
      if (!this.disposed && Array.isArray(data?.colors) && data.colors.length) { this.table = data.colors; this.restyle(); }
    });
    this.wake = () => { if (!this.disposed && (!this.socket || Date.now() - this.lastReceived > 70000)) this.connect(); };
    window.addEventListener("online", this.wake);
    this.visibility = () => { if (!document.hidden) this.wake(); };
    document.addEventListener("visibilitychange", this.visibility);
    this.connect();
  }

  setStatus(text = "") { this.status.textContent = text; this.status.hidden = !text; }
  scrollToBottom() { this.messages.scrollTop = this.messages.scrollHeight; this.latest.hidden = true; }

  cleanup() {
    clearTimeout(this.retryTimer);
    clearTimeout(this.connectTimer);
    clearTimeout(this.pollTimer);
    clearTimeout(this.metadataTimer);
    clearInterval(this.heartbeat);
    this.abort?.abort();
    this.pollAbort?.abort();
    this.pollAbort = null;
    if (this.socket) {
      this.socket.onopen = this.socket.onmessage = this.socket.onerror = this.socket.onclose = null;
      this.socket.close();
      this.socket = null;
    }
  }

  async connect() {
    if (this.disposed) return;
    const generation = ++this.generation;
    this.cleanup();
    const controller = this.abort = new AbortController();
    this.setStatus(this.retries ? "연결이 끊겨 다시 연결 중..." : "채팅 연결 중...");
    const timeout = this.metadataTimer = setTimeout(() => controller.abort(), 18000);
    try {
      const response = await fetch(`/api/chat?channelId=${encodeURIComponent(this.channel.id)}`, { signal: controller.signal, cache: "no-store" });
      const data = await response.json();
      if (generation !== this.generation || this.disposed) return;
      if (!response.ok) {
        if (response.status === 400) { this.setStatus(data.message); return; }
        throw new Error("connection metadata failed");
      }
      if (!data.chatChannelId) { this.retry("채팅방 준비 중...", 60000); return; }
      if (this.chatChannelId && this.chatChannelId !== data.chatChannelId) {
        this.records = []; this.seen.clear(); this.messages.replaceChildren(); this.setNotice(null);
      }
      this.chatChannelId = data.chatChannelId;
      const server = [...data.chatChannelId].reduce((sum, char) => sum + char.charCodeAt(0), 0) % 9 + 1;
      const socket = this.socket = new WebSocket(`wss://kr-ss${server}.chat.naver.com/chat`);
      this.connectTimer = setTimeout(() => this.retry(), 12000);
      socket.onopen = () => this.send({ cmd: 100, tid: 1, bdy: { uid: null, devType: 2001, accTkn: data.accessToken, auth: "READ" } });
      socket.onmessage = event => {
        if (generation !== this.generation) return;
        this.lastReceived = Date.now();
        this.receive(object(event.data));
      };
      socket.onerror = socket.onclose = () => { if (generation === this.generation) this.retry(); };
    } catch {
      if (generation === this.generation && !this.disposed) this.retry();
    } finally { clearTimeout(timeout); }
  }

  retry(text = "연결이 끊겨 다시 연결 중...", delay) {
    if (this.disposed) return;
    ++this.generation;
    this.cleanup();
    this.setStatus(text);
    this.retryTimer = setTimeout(() => this.connect(), delay ?? Math.min(60000, 2000 * 2 ** Math.min(this.retries++, 5)) + Math.random() * 1000);
  }

  send(payload) {
    if (this.socket?.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify({ ver: "2", svcid: "game", cid: this.chatChannelId, ...payload }));
  }

  receive(message) {
    if (message.cmd === 0) { this.send({ cmd: 10000 }); return; }
    if (message.cmd === 10100) {
      if (message.retCode !== 0 || !message.bdy?.sid) { this.retry(); return; }
      clearTimeout(this.connectTimer);
      this.retries = 0;
      this.setStatus();
      this.send({ cmd: 5101, sid: message.bdy.sid, tid: 2, bdy: { recentMessageCount: 50 } });
      clearInterval(this.heartbeat);
      this.heartbeat = setInterval(() => {
        if (Date.now() - this.lastReceived > 70000) this.retry();
        else this.send({ cmd: 0 });
      }, 20000);
      this.poll();
    } else if (message.cmd === 15101) {
      this.add(message.bdy?.messageList || []);
      if ("notice" in (message.bdy || {})) this.setNotice(message.bdy.notice);
    } else if ([93101, 93102].includes(message.cmd)) {
      this.add(Array.isArray(message.bdy) ? message.bdy : []);
    } else if (message.cmd === 94010) this.setNotice(message.bdy);
    else if (message.cmd === 94008) this.blind(message.bdy);
    else if ([94005, 94006].includes(message.cmd)) this.retry();
  }

  poll() {
    clearTimeout(this.pollTimer);
    const generation = this.generation;
    this.pollTimer = setTimeout(async () => {
      const controller = this.pollAbort = new AbortController();
      try {
        const response = await fetch(`/api/chat?channelId=${encodeURIComponent(this.channel.id)}&status=1`, { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(10000)]), cache: "no-store" });
        const data = await response.json();
        if (this.disposed || generation !== this.generation) return;
        if (response.ok && data.chatChannelId !== this.chatChannelId) { this.connect(); return; }
      } catch { /* A transient metadata failure must not interrupt a healthy socket. */ }
      finally { if (this.pollAbort === controller) this.pollAbort = null; }
      if (!this.disposed && generation === this.generation) this.poll();
    }, 60000);
  }

  styleNickname(element, profile) {
    const style = nicknameStyle(profile, this.chatChannelId || "", this.table);
    element.className = "chat-nickname";
    for (const [key, value] of Object.entries({ dark: style.dark, light: style.light, "end-dark": style.endDark, "end-light": style.endLight, "bg-dark": style.bgDark, "bg-light": style.bgLight })) {
      if (value) element.style.setProperty(`--nick-${key}`, value);
    }
    if (style.effect === "GRADATION") element.classList.add("gradient");
    if (style.effect === "HIGHLIGHT") element.classList.add("highlight");
    if (style.effect === "STEALTH") element.classList.add("stealth");
  }

  restyle() { for (const record of this.records) if (record.nick) this.styleNickname(record.nick, record.profile); }

  add(messages) {
    const fragment = document.createDocumentFragment();
    for (const message of messages) {
      const key = messageKey(message);
      const hidden = message.hidden || (message.msgStatusType ?? message.messageStatusType) === "HIDDEN";
      if (this.seen.has(key)) {
        if (hidden) this.blind({ messageTime: message.msgTime ?? message.messageTime, userIdHash: message.uid || object(message.profile).userIdHash });
        continue;
      }
      this.seen.add(key);
      if (this.seen.size > MAX_MESSAGES * 2) this.seen.delete(this.seen.values().next().value);
      const profile = object(message.profile);
      const extras = object(message.extras);
      const type = message.msgTypeCode ?? message.messageTypeCode;
      const row = document.createElement("div");
      row.className = "chat-message";
      const record = { key, row, profile, time: message.msgTime ?? message.messageTime, user: message.uid || profile.userIdHash };
      if (hidden) {
        row.classList.add("blind"); row.textContent = "삭제된 메시지입니다.";
      } else if (type === 30) {
        row.classList.add("chat-system"); row.textContent = extras.description || "";
      } else if (type === 10) {
        row.classList.add("donation");
        const name = document.createElement("div");
        name.className = "donation-name";
        name.textContent = profile.nickname || "익명의 후원자";
        const body = document.createElement("div");
        body.className = "donation-message";
        appendText(body, message.msg ?? message.content, object(extras.emojis));
        const amount = document.createElement("div");
        amount.className = "donation-amount";
        const value = Number(extras.payAmount);
        const formatted = (Number.isFinite(value) && value >= 0 ? value : 0).toLocaleString("ko-KR");
        amount.setAttribute("aria-label", `${formatted} 치즈`);
        const cheese = document.createElement("span");
        cheese.className = "donation-cheese";
        cheese.setAttribute("aria-hidden", "true");
        cheese.textContent = "🧀";
        amount.append(cheese, document.createTextNode(formatted));
        row.append(name, body, amount);
      } else {
        for (const badge of badges(profile)) {
          const img = document.createElement("img");
          img.className = "chat-badge"; img.src = badge.url; img.alt = ""; img.title = badge.title;
          img.referrerPolicy = "no-referrer";
          img.addEventListener("error", () => img.remove(), { once: true });
          row.append(img);
        }
        const nick = record.nick = document.createElement("span");
        nick.textContent = profile.nickname || "익명";
        this.styleNickname(nick, profile);
        row.append(nick);
        if (type === 11) {
          row.classList.add("subscription");
          const label = document.createElement("span");
          label.className = "chat-system";
          label.textContent = `${extras.month || ""}개월 구독 `;
          row.append(label);
        }
        appendText(row, message.msg ?? message.content, object(extras.emojis));
      }
      this.records.push(record);
      fragment.append(row);
    }
    const oldHeight = this.messages.scrollHeight;
    this.messages.append(fragment);
    let removedHeight = 0;
    while (this.records.length > MAX_MESSAGES) {
      const record = this.records.shift();
      removedHeight += record.row.getBoundingClientRect().height;
      record.row.remove();
    }
    if (this.follow) this.scrollToBottom();
    else {
      if (removedHeight && oldHeight) this.messages.scrollTop = Math.max(0, this.messages.scrollTop - removedHeight);
      this.latest.hidden = false;
    }
  }

  setNotice(message) {
    this.notice.replaceChildren();
    const value = object(message);
    const text = value.msg ?? value.content ?? "";
    this.notice.hidden = !text;
    if (text) appendText(this.notice, text, object(object(value.extras).emojis));
  }

  blind(body) {
    const items = Array.isArray(body) ? body : [body];
    for (const item of items) {
      if (!item) continue;
      const time = item.messageTime ?? item.msgTime;
      const user = item.blindUserId ?? item.userIdHash ?? item.uid ?? item.userId;
      if (time == null && !user) continue;
      for (const record of this.records) {
        if ((time == null || String(record.time) === String(time)) && (!user || record.user === user)) {
          record.row.className = "chat-message blind";
          record.row.textContent = "삭제된 메시지입니다.";
          record.nick = null;
        }
      }
    }
  }

  refresh() {
    this.records = []; this.seen.clear(); this.messages.replaceChildren(); this.setNotice(null);
    this.follow = true; this.retries = 0; this.connect();
  }

  dispose() {
    this.disposed = true; ++this.generation; this.cleanup();
    this.resizeObserver.disconnect();
    window.removeEventListener("online", this.wake);
    document.removeEventListener("visibilitychange", this.visibility);
  }
}
