import { createHash, randomBytes, randomUUID } from "node:crypto";
import { redis } from "@/lib/db/redis";
import { decryptSecret, encryptSecret } from "@/lib/panels/crypto";

const LIST_KEY = "ng:master-subscriptions:v1";
const tokenKey = (hash: string) => "ng:master-sub-token:v1:" + hash;
const operationKey = (id: string) => "ng:master-sub-operation:v1:" + id;

export type MasterSubscription = {
  id: string;
  username: string;
  panelId: string;
  panelIds: string[];
  tokenHash: string;
  tokenCiphertext: string;
  operationId?: string;
  createdAt: number;
  updatedAt: number;
};

export type MasterSubscriptionSummary = Omit<MasterSubscription, "tokenHash" | "tokenCiphertext">;

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
  const safe = { ...record };
  delete safe.tokenHash;
  delete safe.tokenCiphertext;
  return safe;
}

function secretUrlToken(record: MasterSubscription) {
  return decryptSecret(record.tokenCiphertext);
}

export async function listMasterSubscriptions(): Promise<MasterSubscriptionSummary[]> {
  return Object.values(await read()).map(summary).sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function createMasterSubscription(input: { username: string; panelId: string; panelIds?: string[]; operationId?: string }) {
  const id = randomUUID();
  const token = randomBytes(32).toString("base64url");
  const tokenHash = hashToken(token);
  const now = Date.now();
  const panelIds = [...new Set(input.panelIds?.length ? input.panelIds : [input.panelId])];
  if (!panelIds.includes(input.panelId)) throw new Error("The active panel must be included in the attached panel list.");
  const entry: MasterSubscription = {
    id, username: input.username, panelId: input.panelId, panelIds, tokenHash,
    tokenCiphertext: encryptSecret(token), operationId: input.operationId, createdAt: now, updatedAt: now
  };
  if (input.operationId) {
    const script = `
      local priorId = redis.call("GET", KEYS[2])
      if priorId then return priorId end
      local raw = redis.call("GET", KEYS[1])
      local records = raw and cjson.decode(raw) or {}
      records[ARGV[1]] = cjson.decode(ARGV[2])
      redis.call("SET", KEYS[1], cjson.encode(records))
      redis.call("SET", KEYS[3], ARGV[3])
      redis.call("SET", KEYS[2], ARGV[1])
      return ARGV[1]
    `;
    const result = await redis.eval(script, [LIST_KEY, operationKey(input.operationId), tokenKey(tokenHash)], [id, JSON.stringify(entry), JSON.stringify({ id, username: entry.username, panelId: entry.panelId })]);
    const actualId = String(result || "");
    const records = await read();
    const actual = records[actualId];
    if (!actual) throw new Error("Could not retrieve idempotent master subscription.");
    const requestedPanels = [...panelIds].sort().join("|");
    const actualPanels = [...(actual.panelIds || [actual.panelId])].sort().join("|");
    if (actual.username !== input.username || actual.panelId !== input.panelId || actualPanels !== requestedPanels) {
      throw new Error("MASTER_SUBSCRIPTION_OPERATION_REUSED_WITH_DIFFERENT_INPUT");
    }
    return { subscription: summary(actual), token: secretUrlToken(actual) };
  }

  const script = `
    local raw = redis.call("GET", KEYS[1])
    local records = raw and cjson.decode(raw) or {}
    records[ARGV[1]] = cjson.decode(ARGV[2])
    redis.call("SET", KEYS[1], cjson.encode(records))
    redis.call("SET", KEYS[2], ARGV[3])
    return 1
  `;
  await redis.eval(script, [LIST_KEY, tokenKey(tokenHash)], [id, JSON.stringify(entry), JSON.stringify({ id, username: entry.username, panelId: entry.panelId })]);
  return { subscription: summary(entry), token };
}

export async function updateMasterSubscriptionPanel(id: string, panelId: string) {
  const script = `
    local raw = redis.call("GET", KEYS[1])
    if not raw then return 0 end
    local records = cjson.decode(raw)
    local entry = records[ARGV[1]]
    if not entry then return 0 end
    local allowed = false
    for _, attached in ipairs(entry.panelIds or {entry.panelId}) do
      if attached == ARGV[2] then allowed = true end
    end
    if not allowed then return -1 end
    entry.panelId = ARGV[2]
    entry.updatedAt = tonumber(ARGV[3])
    records[ARGV[1]] = entry
    redis.call("SET", KEYS[1], cjson.encode(records))
    redis.call("SET", "ng:master-sub-token:v1:" .. entry.tokenHash, cjson.encode({id=entry.id, username=entry.username, panelId=entry.panelId}))
    return 1
  `;
  const result = await redis.eval(script, [LIST_KEY], [id, panelId, String(Date.now())]);
  if (Number(result) !== 1) {
    if (Number(result) === -1) throw new Error("The selected panel is not attached to this master subscription.");
    return null;
  }
  const updated = (await read())[id];
  return updated ? summary(updated) : null;
}

export async function getMasterSubscriptionByToken(token: string): Promise<{ id: string; username: string; panelId: string } | null> {
  if (!/^[A-Za-z0-9_-]{40,64}$/.test(token)) return null;
  return await redis.get<{ id: string; username: string; panelId: string }>(tokenKey(hashToken(token))) ?? null;
}

export async function rotateMasterSubscriptionToken(id: string) {
  const token = randomBytes(32).toString("base64url");
  const tokenHash = hashToken(token);
  const tokenCiphertext = encryptSecret(token);
  const now = Date.now();
  const script = `
    local raw = redis.call("GET", KEYS[1])
    if not raw then return 0 end
    local records = cjson.decode(raw)
    local entry = records[ARGV[1]]
    if not entry then return 0 end
    local oldHash = entry.tokenHash
    entry.tokenHash = ARGV[2]
    entry.tokenCiphertext = ARGV[3]
    entry.updatedAt = tonumber(ARGV[4])
    records[ARGV[1]] = entry
    redis.call("SET", KEYS[1], cjson.encode(records))
    redis.call("DEL", "ng:master-sub-token:v1:" .. oldHash)
    redis.call("SET", "ng:master-sub-token:v1:" .. ARGV[2], cjson.encode({id=entry.id, username=entry.username, panelId=entry.panelId}))
    return 1
  `;
  const result = await redis.eval(script, [LIST_KEY], [id, tokenHash, tokenCiphertext, String(now)]);
  if (Number(result) !== 1) return null;
  const updated = (await read())[id];
  return updated ? { subscription: summary(updated), token } : null;
}

export async function deleteMasterSubscription(id: string) {
  const script = `
    local raw = redis.call("GET", KEYS[1])
    if not raw then return 0 end
    local records = cjson.decode(raw)
    local entry = records[ARGV[1]]
    if not entry then return 0 end
    records[ARGV[1]] = nil
    redis.call("SET", KEYS[1], cjson.encode(records))
    redis.call("DEL", "ng:master-sub-token:v1:" .. entry.tokenHash)
    if entry.operationId then redis.call("DEL", "ng:master-sub-operation:v1:" .. entry.operationId) end
    return 1
  `;
  return Number(await redis.eval(script, [LIST_KEY], [id])) === 1;
}
