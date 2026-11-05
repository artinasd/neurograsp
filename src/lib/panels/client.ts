import { getPanelCredentials } from "@/lib/panels/store";
import { validatePanelBaseUrl } from "@/lib/panels/url";

const TIMEOUT_MS = 8000;

async function request(url: string, init: RequestInit = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal, cache: "no-store", redirect: "error" });
  } finally { clearTimeout(timer); }
}

export async function testPasarGuardPanel(id: string) {
  const panel = await getPanelCredentials(id);
  if (!panel) throw new Error("Panel connection not found.");
  const baseUrl = await validatePanelBaseUrl(panel.baseUrl);
  const tokenResponse = await request(new URL("/api/admin/token", baseUrl).toString(), {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams({ username: panel.username, password: panel.password, grant_type: "password" })
  });
  const tokenBody = await tokenResponse.text();
  let tokenData: unknown;
  try { tokenData = JSON.parse(tokenBody); } catch { throw new Error("Panel authentication returned an unreadable response."); }
  const token = tokenData && typeof tokenData === "object" ? (tokenData as Record<string, unknown>).access_token : null;
  if (!tokenResponse.ok || typeof token !== "string" || !token) {
    throw new Error("Panel authentication failed (HTTP " + tokenResponse.status + "). Check the saved credentials.");
  }
  const health = await request(new URL("/api/users?limit=1&offset=0", baseUrl).toString(), {
    headers: { Authorization: "Bearer " + token, Accept: "application/json" }
  });
  if (!health.ok) throw new Error("Panel authenticated but user API check failed (HTTP " + health.status + ").");
  const contentType = health.headers.get("content-type") || "";
  if (!contentType.includes("json")) throw new Error("Panel user API did not return JSON.");
  return { ok: true as const, message: "Authentication and user API check succeeded." };
}
