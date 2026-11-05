import { api } from "@/lib/panels/pasarguard";

function isUserApiPayload(value: unknown): boolean {
  if (Array.isArray(value)) return true;
  if (!value || typeof value !== "object") return false;
  // The guarded client wraps malformed upstream JSON as { raw: ... }.
  return !("raw" in value);
}

export async function testPasarGuardPanel(id: string) {
  // api() authenticates and routes through the SSRF-resistant HTTPS transport.
  const users = await api(id, "/api/users?limit=1&offset=0", { method: "GET" });
  if (!isUserApiPayload(users)) throw new Error("Panel user API did not return valid JSON.");
  return { ok: true as const, message: "Authentication and user API check succeeded." };
}
