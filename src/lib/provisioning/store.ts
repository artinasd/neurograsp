import { createHash, randomUUID } from "node:crypto";
import { redis } from "@/lib/db/redis";
import type { ProvisioningOperation, PanelOperationResult } from "@/lib/provisioning/types";

const operationKey = (id: string) => "ng:operation:v1:" + id;
const idempotencyKey = (value: string) => "ng:operation-idem:v1:" + createHash("sha256").update(value).digest("hex");

export function newOperationId() { return randomUUID(); }

export async function createOperation(input: Omit<ProvisioningOperation, "state" | "createdAt" | "updatedAt" | "results">): Promise<ProvisioningOperation> {
  if (!input.id || !input.idempotencyKey || !input.username || !input.panelIds.length) throw new Error("Missing operation fields.");
  const now = Date.now();
  const operation: ProvisioningOperation = { ...input, state: "queued", createdAt: now, updatedAt: now, results: Object.fromEntries(input.panelIds.map(panelId => [panelId, { panelId, state: "queued", attemptCount: 0, updatedAt: now }])) };
  const script = `
    local existing = redis.call("GET", KEYS[1])
    if existing then return existing end
    if redis.call("EXISTS", KEYS[2]) == 1 then return redis.call("GET", KEYS[2]) end
    redis.call("SET", KEYS[1], ARGV[1])
    redis.call("SET", KEYS[2], ARGV[1])
    return ARGV[1]
  `;
  const result = await redis.eval<string>(script, [operationKey(input.id), idempotencyKey(input.idempotencyKey)], [JSON.stringify(operation)]);
  const parsed = typeof result === "string" ? JSON.parse(result) as ProvisioningOperation : null;
  if (!parsed) throw new Error("Could not persist provisioning operation.");
  // Reusing an idempotency key with a different order payload must be rejected,
  // not silently mapped onto the first order.
  if (parsed.idempotencyKey !== input.idempotencyKey ||
      parsed.username !== input.username ||
      parsed.reservationId !== input.reservationId ||
      parsed.panelIds.join("|") !== input.panelIds.join("|") ||
      JSON.stringify(parsed.snapshot) !== JSON.stringify(input.snapshot)) {
    throw new Error("IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_INPUT");
  }
  return parsed;
}

export async function getOperation(id: string): Promise<ProvisioningOperation | null> {
  return await redis.get<ProvisioningOperation>(operationKey(id)) ?? null;
}

export async function getOperationByIdempotency(value: string): Promise<ProvisioningOperation | null> {
  const operation = await redis.get<ProvisioningOperation>(idempotencyKey(value));
  return operation ?? null;
}

export async function updatePanelResult(operationId: string, result: PanelOperationResult, state: ProvisioningOperation["state"]) {
  const script = `
    local raw = redis.call("GET", KEYS[1])
    if not raw then return cjson.encode({ok=false, code="NOT_FOUND"}) end
    local op = cjson.decode(raw)
    if not op.results[ARGV[1]] then return cjson.encode({ok=false, code="PANEL_NOT_ATTACHED"}) end
    op.results[ARGV[1]] = cjson.decode(ARGV[2])
    op.state = ARGV[3]
    op.updatedAt = tonumber(ARGV[4])
    redis.call("SET", KEYS[1], cjson.encode(op))
    return cjson.encode({ok=true, operation=op})
  `;
  const response = await redis.eval<string>(script, [operationKey(operationId)], [result.panelId, JSON.stringify(result), state, String(Date.now())]);
  const parsed = typeof response === "string" ? JSON.parse(response) as { ok: boolean; operation?: ProvisioningOperation; code?: string } : null;
  if (!parsed?.ok || !parsed.operation) throw new Error(parsed?.code || "Could not update panel operation.");
  return parsed.operation;
}

export async function setOperationState(operationId: string, state: ProvisioningOperation["state"]) {
  const script = `
    local raw = redis.call("GET", KEYS[1])
    if not raw then return cjson.encode({ok=false, code="NOT_FOUND"}) end
    local op = cjson.decode(raw)
    op.state = ARGV[1]
    op.updatedAt = tonumber(ARGV[2])
    redis.call("SET", KEYS[1], cjson.encode(op))
    return cjson.encode({ok=true, operation=op})
  `;
  const response = await redis.eval<string>(script, [operationKey(operationId)], [state, String(Date.now())]);
  const parsed = typeof response === "string" ? JSON.parse(response) as { ok: boolean; operation?: ProvisioningOperation; code?: string } : null;
  if (!parsed?.ok || !parsed.operation) throw new Error(parsed?.code || "Could not update operation state.");
  return parsed.operation;
}
