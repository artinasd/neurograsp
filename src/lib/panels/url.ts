import { lookup } from "node:dns/promises";
import { isIP, type LookupFunction } from "node:net";

/** Reject non-global IPv4 ranges before a panel URL can be used. */
export function isPrivateIPv4(ip: string): boolean {
  const p = ip.split(".").map(Number);
  if (p.length !== 4 || p.some(n => !Number.isInteger(n) || n < 0 || n > 255)) return true;
  const [a, b, c] = p;

  return a === 0 ||                         // "This" network
    a === 10 ||                             // RFC 1918
    a === 127 ||                            // Loopback
    (a === 100 && b >= 64 && b <= 127) ||  // Shared address space
    (a === 169 && b === 254) ||             // Link-local
    (a === 172 && b >= 16 && b <= 31) ||    // RFC 1918
    (a === 192 && b === 0 && (c === 0 || c === 2)) || // IETF protocol assignments / documentation
    (a === 192 && b === 88 && c === 99) ||  // Deprecated 6to4 relay
    (a === 192 && b === 168) ||             // RFC 1918
    (a === 198 && (b === 18 || b === 19)) ||// Benchmarking
    (a === 198 && b === 51 && c === 100) || // Documentation
    (a === 203 && b === 0 && c === 113) ||  // Documentation
    a >= 224;                               // Multicast and reserved
}

/**
 * Resolve only vetted public IPv4 addresses at connection time. The request
 * retains the hostname for Host and TLS certificate validation.
 */
export const publicIPv4Lookup: LookupFunction = ((hostname: string, options: unknown, callback: (...args: unknown[]) => void) => {
  void lookup(hostname, { all: true, verbatim: true }).then(addresses => {
    const safe = addresses.filter(record => record.family === 4 && !isPrivateIPv4(record.address));
    if (!safe.length || safe.length !== addresses.length) {
      callback(Object.assign(new Error("Panel hostname resolves to a private or unsupported address."), { code: "EACCES" }));
      return;
    }
    const all = typeof options === "object" && options !== null && "all" in options && options.all === true;
    if (all) callback(null, safe);
    else callback(null, safe[0].address, safe[0].family);
  }).catch(() => callback(Object.assign(new Error("Panel hostname could not be resolved."), { code: "ENOTFOUND" })));
}) as unknown as LookupFunction;

export async function validatePanelBaseUrl(input: string): Promise<string> {
  let url: URL;
  try { url = new URL(input.trim()); } catch { throw new Error("Enter a valid panel URL."); }
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) {
    throw new Error("Panel URL must use HTTPS and cannot include credentials, query parameters, or a fragment.");
  }
  const hostname = url.hostname.toLowerCase().replace(/^\\[|\\]$/g, "");
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
  url.pathname = url.pathname.replace(/\\/$/, "");
  return url.toString().replace(/\\/$/, "");
}
