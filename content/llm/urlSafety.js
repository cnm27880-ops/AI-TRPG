// [安全] 出站 LLM 請求的 URL 檢查 —— 防止 SSRF。
//
// 背景：/api/turn 與 /api/narrate 都允許呼叫端指定 provider="custom" 搭配自己的
// baseUrl（這是刻意的功能：玩家可以接自己的第三方中轉/自架端點，不用改程式碼）。
// 但「baseUrl 完全由請求端決定」同時也表示：任何人都可以把它指向
// http://169.254.169.254/、http://localhost:xxxx/、內網IP、或任何 Cloudflare
// Worker 網路能碰到的地方，讓伺服器替他們發一個帶著 Authorization header 的請求出去
// ——這正是教科書等級的 SSRF。這個檔案就是擋這一類目標的最後一道關卡。
//
// [誠實的限制] 這裡只能檢查「URL 字面上寫的是什麼」，檢查不到 DNS —— Workers 的
// fetch() 沒有提供「先解析成IP再檢查」的API。一個看起來人畜無害的網域，
// 理論上仍然可能透過 DNS rebinding 在請求當下被解析到內網位址。這個檔案擋得住的是
// 「URL本身就寫著私有位址/loopback/metadata」這一大類最常見、最容易被隨手打進來的
// 攻擊面，不是完整的DNS層級防護；要做到那個等級需要在 fetch 前自己解析並鎖定IP，
// Workers runtime 目前沒有提供對應的低階API可以做這件事。

const IPV4_BLOCKED_RANGES = [
  [0, 0, 0, 0, 8], // "this network"
  [10, 0, 0, 0, 8], // RFC1918
  [100, 64, 0, 0, 10], // 電信級NAT (CGNAT)
  [127, 0, 0, 0, 8], // loopback
  [169, 254, 0, 0, 16], // link-local，各家雲端 metadata endpoint(169.254.169.254)都在這一段
  [172, 16, 0, 0, 12], // RFC1918
  [192, 0, 0, 0, 24], // IETF協定保留
  [192, 168, 0, 0, 16], // RFC1918
  [198, 18, 0, 0, 15], // benchmark
  [224, 0, 0, 0, 4], // multicast
  [240, 0, 0, 0, 4], // 保留
];

// Alibaba Cloud 的 metadata endpoint 用的是這個位址，不在任何 RFC1918/link-local 段內，
// 得額外列出來。
const BLOCKED_LITERAL_HOSTS = new Set(["100.100.100.200"]);

const BLOCKED_HOSTNAME_SUFFIXES = [
  "localhost",
  ".localhost",
  ".local",
  ".internal",
  "metadata.google.internal",
];

function ipv4ToParts(hostname) {
  const match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(hostname);
  if (!match) return null;
  const parts = match.slice(1, 5).map(Number);
  if (parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return null;
  return parts;
}

function isBlockedIpv4(hostname) {
  const parts = ipv4ToParts(hostname);
  if (!parts) return false;
  for (const [a, b, c, d, bits] of IPV4_BLOCKED_RANGES) {
    const base = (a << 24) | (b << 16) | (c << 8) | d;
    const value = (parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3];
    const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
    if ((value & mask) === (base & mask)) return true;
  }
  return false;
}

/** 把 IPv6 字面量正規化：去掉包住它的中括號(URL的hostname在部分執行環境會留著)。 */
function normalizeIpv6(hostname) {
  return hostname.startsWith("[") && hostname.endsWith("]") ? hostname.slice(1, -1) : hostname;
}

/**
 * 把「內嵌IPv4」的兩種常見IPv6寫法解出底下的IPv4位址。
 *
 * WHATWG URL 正規化之後，IPv4-mapped 位址(::ffff:a.b.c.d)幾乎都會被轉成
 * 十六進位群組寫法(例如 ::ffff:169.254.169.254 變成 ::ffff:a9fe:a9fe)，
 * 只用點分十進位的正則會直接漏接——這裡兩種形式都接住，NAT64 的
 * 64:ff9b::/96(RFC 6052) 也是同一類「殼子換一層、底下還是那個IP」的寫法。
 */
function extractEmbeddedIpv4(host) {
  const dotted = /^(?:::ffff:)(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/.exec(host);
  if (dotted) return dotted[1];

  const hexEmbedded = /^(?:::ffff:|64:ff9b::)([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(host);
  if (hexEmbedded) {
    const hi = parseInt(hexEmbedded[1], 16);
    const lo = parseInt(hexEmbedded[2], 16);
    if (Number.isFinite(hi) && Number.isFinite(lo)) {
      const value = ((hi & 0xffff) << 16) | (lo & 0xffff);
      return [(value >>> 24) & 255, (value >>> 16) & 255, (value >>> 8) & 255, value & 255].join(".");
    }
  }
  return null;
}

function isBlockedIpv6(hostname) {
  const host = normalizeIpv6(hostname).toLowerCase();
  if (!host.includes(":")) return false;
  if (host === "::1" || host === "::") return true; // loopback / unspecified
  if (host.startsWith("fe8") || host.startsWith("fe9") || host.startsWith("fea") || host.startsWith("feb")) {
    return true; // fe80::/10 link-local
  }
  if (host.startsWith("fc") || host.startsWith("fd")) return true; // fc00::/7 unique local
  const embedded = extractEmbeddedIpv4(host);
  if (embedded && isBlockedIpv4(embedded)) return true;
  return false;
}

function isBlockedHostname(hostname) {
  const host = hostname.toLowerCase();
  if (BLOCKED_LITERAL_HOSTS.has(host)) return true;
  return BLOCKED_HOSTNAME_SUFFIXES.some((suffix) => host === suffix || host.endsWith(suffix));
}

export class UnsafeOutboundUrlError extends Error {
  constructor(message, { url, reason } = {}) {
    super(message);
    this.name = "UnsafeOutboundUrlError";
    this.code = "UNSAFE_OUTBOUND_URL";
    this.url = url;
    this.reason = reason;
  }
}

/**
 * 檢查一個要 fetch 的 URL 是不是安全的公開端點。不安全就丟 UnsafeOutboundUrlError，
 * 安全就靜靜地回傳（沒有回傳值），呼叫端接著自己做原本的 fetch。
 *
 * 規則：
 *   - 只接受 https:（擋 http:，也連帶擋掉 file:/data: 等其他 scheme）
 *   - hostname 是私有/迴圈/link-local/保留範圍的 IPv4 或 IPv6 一律擋
 *   - hostname 命中已知的 metadata/內部網域樣式(localhost、*.internal、*.local等)一律擋
 */
export function assertSafeOutboundUrl(rawUrl) {
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new UnsafeOutboundUrlError(`不是合法的URL：${rawUrl}`, { url: rawUrl, reason: "invalid-url" });
  }

  if (url.protocol !== "https:") {
    throw new UnsafeOutboundUrlError(
      `outbound請求只能用https，收到「${url.protocol}」（${rawUrl}）`,
      { url: rawUrl, reason: "non-https" }
    );
  }

  const hostname = url.hostname;
  if (isBlockedIpv4(hostname) || isBlockedIpv6(hostname) || isBlockedHostname(hostname)) {
    throw new UnsafeOutboundUrlError(
      `這個目標位址不被允許（內網/loopback/link-local/metadata endpoint）：${hostname}`,
      { url: rawUrl, reason: "blocked-target" }
    );
  }
}
