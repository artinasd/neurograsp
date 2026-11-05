import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

function isPrivateIPv4(ip: string) {
  const p = ip.split(".").map(Number);
  if (p.length !== 4 || p.some(n => !Number.isInteger(n) || n < 0 || n > 255)) return true;
  return p[0] === 0 || p[0] === 10 || p[0] === 127 || p[0] >= 224 ||
    (p[0] === 169 && p[1] === 254) || (p[0] === 172 && p[1] >= 16 && p[1] <= 31) ||
    (p[0] === 192 && p[1] === 168) || (p[0] === 100 && p[1] >= 64 && p[1] <= 127) ||
    (p[0] === 192 && p[1] === 0) || (p[0] === 198 && (p[1] === 18 || p[1] === 19));
}

export async function validatePanelBaseUrl(input: string): Promise<string> {
  let url: URL;
  try { url = new URL(input.trim()); } catch { throw new Error("Enter a valid panel URL."); }
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) {
    throw new Error("Panel URL must use HTTPS and cannot include credentials, query parameters, or a fragment.");
  }
  const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (!hostname || hostname === "localhost" || hostname.endsWith(".localhost") || hostname.endsWith(".local") ||
      hostname.endsWith(".internal") || hostname.endsWith(".lan")) throw new Error("Private or local panel destinations are not accepted.");
  const ipType = isIP(hostname);
  if (ipType === 6) throw new Error("IPv6 literal panel addresses are not accepted.");
  if (ipType === 4 && isPrivateIPv4(hostname)) throw new Error("Private or reserved IPv4 panel addresses are not accepted.");
  if (ipType === 0) {
    let addresses;
    try { addresses = await lookup(hostname, { all: true, verbatim: true }); }
    catch { throw new Error("Panel hostname could not be resolved."); }
    if (!addresses.length || addresses.some(record => record.family === 6 || isPrivateIPv4(record.address))) {
      throw new Error("Panel hostname resolves to a private or unsupported address.");
    }
  }
  url.pathname = url.pathname.replace(/\/$/, "");
  return url.toString().replace(/\/$/, "");
}
