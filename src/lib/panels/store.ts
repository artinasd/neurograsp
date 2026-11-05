import { randomUUID } from "node:crypto";
import { redis } from "@/lib/db/redis";
import { decryptSecret, encryptSecret } from "@/lib/panels/crypto";
import type { PanelConfig, PanelPublicSummary } from "@/lib/panels/types";

const KEY = "ng:panels:v1";

async function read(): Promise<Record<string, PanelConfig>> {
  const value = await redis.get<Record<string, PanelConfig> | string>(KEY);
  if (!value) return {};
  try { const parsed = typeof value === "string" ? JSON.parse(value) : value; return parsed && typeof parsed === "object" ? parsed : {}; }
  catch { return {}; }
}

export async function listPanels(): Promise<PanelPublicSummary[]> {
  const records = await read();
  return Object.values(records).map(({ id, name, baseUrl, groupIds, createdAt, updatedAt }) => ({ id, name, baseUrl, groupIds, createdAt, updatedAt }));
}

export async function getPanel(id: string): Promise<PanelConfig | null> {
  return (await read())[id] ?? null;
}

export async function getPanelCredentials(id: string) {
  const panel = await getPanel(id);
  if (!panel) return null;
  return { ...panel, username: decryptSecret(panel.usernameCiphertext), password: decryptSecret(panel.passwordCiphertext) };
}

export async function savePanel(input: { id?: string; name: string; baseUrl: string; username: string; password: string; groupIds: number[] }): Promise<PanelPublicSummary> {
  const records = await read();
  const id = input.id || randomUUID();
  const existing = records[id];
  if (input.id && !existing) throw new Error("Panel connection was not found.");
  const username = input.username.trim() || (existing ? decryptSecret(existing.usernameCiphertext) : "");
  const password = input.password || (existing ? decryptSecret(existing.passwordCiphertext) : "");
  if (!username || !password) throw new Error("Username and password are required for a new connection.");
  const now = Date.now();
  const next: PanelConfig = {
    id, name: input.name.trim().slice(0, 80), baseUrl: input.baseUrl,
    usernameCiphertext: encryptSecret(username), passwordCiphertext: encryptSecret(password),
    groupIds: input.groupIds, createdAt: existing?.createdAt ?? now, updatedAt: now
  };
  records[id] = next;
  await redis.set(KEY, records);
  return { id, name: next.name, baseUrl: next.baseUrl, groupIds: next.groupIds, createdAt: next.createdAt, updatedAt: next.updatedAt };
}

export async function deletePanel(id: string) {
  const records = await read();
  if (!records[id]) throw new Error("Panel connection was not found.");
  delete records[id];
  await redis.set(KEY, records);
}
