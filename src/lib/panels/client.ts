import { api, auth } from "@/lib/panels/pasarguard";

function isJsonValue(value: unknown): boolean {
  return value !== null && (typeof value === "object" || typeof value === "string" ||
    typeof value === "number" || typeof value === "boolean");
}

export async function testPasarGuardPanel(id: string) {
  // Use the same SSRF-resistant HTTPS transport as provisioning requests.
  await auth(id);
  const users = await api(id, "/api/users?limit=1&offset=0", { method: "GET" });
  if (!isJsonValue(users)) throw new Error("Panel user API did not return JSON.");
  return { ok: true as const, message: "Authentication and user API check succeeded." };
}
