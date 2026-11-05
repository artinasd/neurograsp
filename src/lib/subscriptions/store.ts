import { createHash, randomBytes, randomUUID } from "node:crypto";
import { redis } from "@/lib/db/redis";

const LIST_KEY = "ng:master-subscriptions:v1";
const tokenKey = (hash: string) => "ng:master-sub-token:v1:" + hash;

export type MasterSubscription = {
  id: string;
  username: string;
  panelId: string;
  tokenHash: string;
  createdAt: number;
  updatedAt: number;
};

export type MasterSubscriptionSummary = Omit<MasterSubscription, "tokenHash">;

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

async function read(): Promise<Record<string, MasterSubscription>> {
  const value = await redis.get<Record<string, MasterSubscription> | string>(LIST_KEY);
  if (!value) return {};
  try {
    const parsed = typeof value === "string" ? JSON.parse(value) : value;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch { return {}; }
}

function summary(record: MasterSubscription): MasterSubscriptionSummary {
  const { tokenHash: _secret, ...safe } = record;
  return safe;
}

export async function listMasterSubscriptions(): Promise<MasterSubscriptionSummary[]> {
  return Object.values(await read()).map(summary).sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function createMasterSubscription(input: { username: string; panelId: string }) {
  const records = await read();
  const id = randomUUID();
  const token = randomBytes(32).toString("base64url");
  const tokenHash = hashToken(token);
  const now = Date.now();
  const entry: MasterSubscription = { id, username: input.username, panelId: input.panelId, tokenHash, createdAt: now, updatedAt: now };
  records[id] = entry;
  await redis.set(LIST_KEY, records);
  await redis.set(tokenKey(tokenHash), { id, username: entry.username, panelId: entry.panelId });
  return { subscription: summary(entry), token };
}

export async function updateMasterSubscriptionPanel(id: string, panelId: string) {
  const records = await read();
  const existing = records[id];
  if (!existing) return null;
  existing.panelId = panelId;
  existing.updatedAt = Date.now();
  records[id] = existing;
  await redis.set(LIST_KEY, records);
  await redis.set(tokenKey(existing.tokenHash), { id, username: existing.username, panelId });
  return summary(existing);
}

export async function getMasterSubscriptionByToken(token: string): Promise<{ id: string; username: string; panelId: string } | null> {
  if (!/^[A-Za-z0-9_-]{40,64}$/.test(token)) return null;
  const hash = hashToken(token);
  return await redis.get<{ id: string; username: string; panelId: string }>(tokenKey(hash)) ?? null;
}

export async function rotateMasterSubscriptionToken(id: string) {
  const records = await read();
  const existing = records[id];
  if (!existing) return null;
  const oldHash = existing.tokenHash;
  const token = randomBytes(32).toString("base64url");
  const tokenHash = hashToken(token);
  existing.tokenHash = tokenHash;
  existing.updatedAt = Date.now();
  records[id] = existing;
  await redis.set(LIST_KEY, records);
  await redis.del(tokenKey(oldHash));
  await redis.set(tokenKey(tokenHash), { id, username: existing.username, panelId: existing.panelId });
  return { subscription: summary(existing), token };
}
