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
  const id = randomUUID();
  const token = randomBytes(32).toString("base64url");
  const tokenHash = hashToken(token);
  const now = Date.now();
  const entry: MasterSubscription = { id, username: input.username, panelId: input.panelId, tokenHash, createdAt: now, updatedAt: now };
  const script = `
    local raw = redis.call("GET", KEYS[1])
    local records = raw and cjson.decode(raw) or {}
    records[ARGV[1]] = cjson.decode(ARGV[2])
    redis.call("SET", KEYS[1], cjson.encode(records))
    redis.call("SET", KEYS[2], ARGV[3])
    return 1
  `;
  await redis.eval<number>(script, [LIST_KEY, tokenKey(tokenHash)], [id, JSON.stringify(entry), JSON.stringify({ id, username: entry.username, panelId: entry.panelId })]);
  return { subscription: summary(entry), token };
}

export async function updateMasterSubscriptionPanel(id: string, panelId: string) {
  const script = `
    local raw = redis.call("GET", KEYS[1])
    if not raw then return 0 end
    local records = cjson.decode(raw)
    local entry = records[ARGV[1]]
    if not entry then return 0 end
    entry.panelId = ARGV[2]
    entry.updatedAt = tonumber(ARGV[3])
    records[ARGV[1]] = entry
    redis.call("SET", KEYS[1], cjson.encode(records))
    redis.call("SET", "ng:master-sub-token:v1:" .. entry.tokenHash, cjson.encode({id=entry.id, username=entry.username, panelId=entry.panelId}))
    return 1
  `;
  const result = await redis.eval<number>(script, [LIST_KEY], [id, panelId, String(Date.now())]);
  if (Number(result) !== 1) return null;
  const records = await read();
  const updated = records[id];
  return updated ? summary(updated) : null;
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
  const now = Date.now();
  const script = `
    local raw = redis.call("GET", KEYS[1])
    if not raw then return 0 end
    local records = cjson.decode(raw)
    local entry = records[ARGV[1]]
    if not entry then return 0 end
    local oldHash = entry.tokenHash
    entry.tokenHash = ARGV[2]
    entry.updatedAt = tonumber(ARGV[3])
    records[ARGV[1]] = entry
    redis.call("SET", KEYS[1], cjson.encode(records))
    redis.call("DEL", "ng:master-sub-token:v1:" .. oldHash)
    redis.call("SET", "ng:master-sub-token:v1:" .. ARGV[2], cjson.encode({id=entry.id, username=entry.username, panelId=entry.panelId}))
    return 1
  `;
  const result = await redis.eval<number>(script, [LIST_KEY], [id, tokenHash, String(now)]);
  if (Number(result) !== 1) return null;
  existing.tokenHash = tokenHash;
  existing.updatedAt = now;
  return { subscription: summary(existing), token };
}
