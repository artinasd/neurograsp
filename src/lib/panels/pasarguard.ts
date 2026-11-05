import { request as httpsRequest } from "node:https";
import { publicIPv4Lookup } from "@/lib/panels/url";
import { getPanelCredentials } from "@/lib/panels/store";
import { validatePanelBaseUrl } from "@/lib/panels/url";

const REQUEST_TIMEOUT_MS = 10000;
type JsonRecord = Record<string, unknown>;

function record(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : null;
}

function extractUsers(value: unknown): JsonRecord[] {
  if (Array.isArray(value)) return value.map(record).filter((v): v is JsonRecord => Boolean(v));
  const data = record(value);
  for (const key of ["users", "items", "data"]) {
    if (Array.isArray(data?.[key])) return (data![key] as unknown[]).map(record).filter((v): v is JsonRecord => Boolean(v));
  }
  return [];
}

async function fetchWithTimeout(url: string, init: RequestInit = {}): Promise<Response> {
  const target = new URL(url);
  if (target.protocol !== "https:") throw new Error("Only HTTPS panel requests are allowed.");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const headers = new Headers(init.headers);
    const requestHeaders: Record<string, string> = {};
    headers.forEach((value, key) => { requestHeaders[key] = value; });
    const body = init.body instanceof URLSearchParams ? init.body.toString() :
      typeof init.body === "string" ? init.body :
      init.body instanceof Uint8Array ? Buffer.from(init.body) : undefined;
    const responseBytes = await new Promise<{ status: number; headers: Headers; body: Buffer }>((resolve, reject) => {
      const req = httpsRequest(target, {
        method: init.method || "GET",
        headers: requestHeaders,
        lookup: publicIPv4Lookup,
        signal: controller.signal
      }, response => {
        const chunks: Buffer[] = [];
        response.on("data", chunk => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
        response.on("error", reject);
        response.on("end", () => {
          const responseHeaders = new Headers();
          for (const [name, value] of Object.entries(response.headers)) {
            if (value === undefined) continue;
            responseHeaders.set(name, Array.isArray(value) ? value.join(", ") : String(value));
          }
          resolve({ status: response.statusCode || 502, headers: responseHeaders, body: Buffer.concat(chunks) });
        });
      });
      req.on("error", reject);
      if (body !== undefined) req.write(body);
      req.end();
    });
    if (responseBytes.status >= 300 && responseBytes.status < 400) throw new Error("Panel redirects are not accepted.");
    return new Response(responseBytes.body, { status: responseBytes.status, headers: responseBytes.headers });
  } finally { clearTimeout(timer); }
}

export class PanelHttpError extends Error {
  constructor(public readonly status: number, message: string) { super(message); this.name = "PanelHttpError"; }
}

export class PanelUncertainError extends Error {
  constructor(message: string) { super(message); this.name = "PanelUncertainError"; }
}

async function auth(id: string) {
  const panel = await getPanelCredentials(id);
  if (!panel) throw new Error("Panel connection not found.");
  const baseUrl = await validatePanelBaseUrl(panel.baseUrl);
  let response: Response;
  try {
    response = await fetchWithTimeout(new URL("/api/admin/token", baseUrl).toString(), {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      body: new URLSearchParams({ username: panel.username, password: panel.password, grant_type: "password" })
    });
  } catch {
    throw new PanelUncertainError("Panel authentication outcome is unknown because the request failed or timed out.");
  }
  const text = await response.text();
  let body: unknown;
  try { body = text ? JSON.parse(text) : null; } catch { throw new Error("PasarGuard token endpoint returned invalid JSON."); }
  const token = record(body)?.access_token;
  if (!response.ok || typeof token !== "string" || !token) throw new PanelHttpError(response.status, "PasarGuard authentication rejected the saved credentials.");
  return { panel, baseUrl, token };
}

async function api(id: string, path: string, init: RequestInit = {}) {
  const { baseUrl, token } = await auth(id);
  const url = new URL(path, baseUrl + "/");
  if (url.origin !== new URL(baseUrl).origin) throw new Error("Invalid PasarGuard API path.");
  let response: Response;
  try {
    response = await fetchWithTimeout(url.toString(), {
      ...init, headers: { Accept: "application/json", Authorization: "Bearer " + token, ...(init.headers || {}) }
    });
  } catch {
    throw new PanelUncertainError("PasarGuard mutation/read timed out or failed at transport level; remote outcome may be unknown.");
  }
  const text = await response.text();
  let data: unknown = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text.slice(0, 300) }; }
  if (!response.ok) throw new PanelHttpError(response.status, "PasarGuard returned HTTP " + response.status + ".");
  return data;
}

export type PasarGuardUserSnapshot = {
  username: string;
  dataLimitBytes: number;
  expireAt: number;
  status: "active" | "disabled";
  note: string;
  groupIds: number[];
};

export async function findExactPasarGuardUser(panelId: string, username: string): Promise<JsonRecord | null> {
  const query = new URLSearchParams({ search: username, limit: "100", offset: "0" });
  const users = extractUsers(await api(panelId, "/api/users?" + query.toString(), { method: "GET" }));
  return users.find(user => user.username === username && (typeof user.id === "string" || typeof user.id === "number")) ?? null;
}

export async function createPasarGuardUser(panelId: string, snapshot: PasarGuardUserSnapshot) {
  const panel = await getPanelCredentials(panelId);
  if (!panel) throw new Error("Panel connection not found.");
  if (!panel.groupIds.length) throw new Error("Configure at least one group ID for this panel before provisioning.");
  const payload = {
    username: snapshot.username,
    status: snapshot.status,
    data_limit: snapshot.dataLimitBytes,
    expire: new Date(snapshot.expireAt * 1000).toISOString(),
    group_ids: panel.groupIds,
    note: snapshot.note.slice(0, 240)
  };
  return api(panelId, "/api/user", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
}

export async function readPasarGuardUser(panelId: string, username: string) {
  return findExactPasarGuardUser(panelId, username);
}

export async function updatePasarGuardUserById(panelId: string, remoteId: string | number, snapshot: Partial<PasarGuardUserSnapshot>) {
  const payload: JsonRecord = {};
  if (snapshot.dataLimitBytes !== undefined) payload.data_limit = snapshot.dataLimitBytes;
  if (snapshot.expireAt !== undefined) payload.expire = new Date(snapshot.expireAt * 1000).toISOString();
  if (snapshot.status !== undefined) payload.status = snapshot.status;
  if (snapshot.note !== undefined) payload.note = snapshot.note.slice(0, 240);
  return api(panelId, "/api/user/by-id/" + encodeURIComponent(String(remoteId)), {
    method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload)
  });
}

export async function deletePasarGuardUserById(panelId: string, remoteId: string | number) {
  return api(panelId, "/api/user/by-id/" + encodeURIComponent(String(remoteId)), { method: "DELETE" });
}

export async function getPasarGuardSubscriptionUrl(panelId: string, username: string): Promise<string> {
  const user = await findExactPasarGuardUser(panelId, username);
  if (!user) throw new Error("Exact username was not found on the selected PasarGuard panel.");
  const candidate = typeof user.subscription_url === "string" ? user.subscription_url
    : typeof user.subscriptionUrl === "string" ? user.subscriptionUrl
    : typeof record(user.links)?.subscription === "string" ? String(record(user.links)!.subscription)
    : typeof user.subscription_link === "string" ? user.subscription_link
    : "";
  if (!candidate) throw new Error("PasarGuard user response does not expose a subscription URL.");
  const panel = await getPanelCredentials(panelId);
  if (!panel) throw new Error("Panel connection not found.");
  const baseUrl = await validatePanelBaseUrl(panel.baseUrl);
  let upstream: URL;
  try { upstream = new URL(candidate, baseUrl + "/"); }
  catch { throw new Error("PasarGuard returned an invalid subscription URL."); }
  if (upstream.protocol !== "https:" || upstream.origin !== new URL(baseUrl).origin ||
      upstream.username || upstream.password || upstream.hash) {
    throw new Error("Subscription URL must use HTTPS on the configured panel origin.");
  }
  return upstream.toString();
}

export async function fetchNativePasarGuardSubscription(panelId: string, username: string, request: Request): Promise<Response> {
  const upstreamUrl = await getPasarGuardSubscriptionUrl(panelId, username);
  const headers = new Headers();
  const userAgent = request.headers.get("user-agent");
  const accept = request.headers.get("accept");
  if (userAgent) headers.set("User-Agent", userAgent.slice(0, 512));
  if (accept) headers.set("Accept", accept.slice(0, 512));
  // Preserve PasarGuard's optional client identity headers so its native HWID
  // behavior remains upstream-controlled. Never relay cookies or Authorization.
  for (const name of ["x-hwid", "x-device-os", "x-ver-os", "x-device-model"]) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value.slice(0, 512));
  }
  let response: Response;
  try { response = await fetchWithTimeout(upstreamUrl, { method: "GET", headers, redirect: "error" }); }
  catch { throw new PanelUncertainError("Native subscription upstream could not be reached."); }
  const outgoing = new Headers();
  for (const name of ["content-type", "subscription-userinfo", "profile-title", "profile-update-interval", "support-url", "announce", "content-disposition", "profile-web-page-url"]) {
    const value = response.headers.get(name);
    if (value) outgoing.set(name, value);
  }
  outgoing.set("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
  outgoing.set("Pragma", "no-cache");
  outgoing.set("X-Content-Type-Options", "nosniff");
  outgoing.set("Referrer-Policy", "no-referrer");
  outgoing.set("X-Robots-Tag", "noindex, nofollow, noarchive");
  return new Response(response.body, { status: response.status, headers: outgoing });
}
