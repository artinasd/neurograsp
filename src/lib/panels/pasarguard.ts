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

async function fetchWithTimeout(url: string, init: RequestInit = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal, cache: "no-store", redirect: "error" });
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
