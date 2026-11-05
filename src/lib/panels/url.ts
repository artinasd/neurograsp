import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

function isPrivateIPv4(ip: string) {
  const p = ip.split(".").map(Number);
  if (p.length !== 4 || p.some(n => !Number.isInteger(n) || n < 0 || n > 255)) return true;
  const [a, b, c] = p;
  return a === 0 || a === 10 || a === 127 || a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && (b === 0 || b === 2 || b === 168)) ||
    (a === 192 && b === 88 && c === 99) ||
    (a === 198 && (b === 18 || b === 19 || b === 51 && c === 100)) ||
    (a === 203 && b === 0 && c === 113);
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
