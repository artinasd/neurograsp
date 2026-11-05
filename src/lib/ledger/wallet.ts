import { createHash, randomUUID } from "node:crypto";
import { redis } from "@/lib/db/redis";
import type { LedgerEntry, ReservationRecord, WalletSnapshot } from "@/lib/ledger/types";

const walletKey = (resellerId: string) => "ng:wallet:v1:" + resellerId;
const ledgerKey = (resellerId: string) => "ng:ledger:v1:" + resellerId;
const reservationKey = (reservationId: string) => "ng:reservation:v1:" + reservationId;
const idempotencyKey = (value: string) => "ng:idem:v1:" + createHash("sha256").update(value).digest("hex");

function assertPositiveInteger(value: number, name: string) {
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error(name + " must be a positive safe integer.");
}

function parseScriptResult(value: unknown): Record<string, unknown> {
  if (typeof value !== "string") throw new Error("Unexpected Redis ledger script result.");
  const parsed: unknown = JSON.parse(value);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Invalid ledger result.");
  return parsed as Record<string, unknown>;
}

const RESERVE_SCRIPT = `
local prior = redis.call("GET", KEYS[3])
if prior then
  local previous = cjson.decode(prior)
  local previousReservation = previous.reservation
  local intended = cjson.decode(ARGV[2])
  if not previousReservation or previousReservation.id ~= intended.id or previousReservation.resellerId ~= intended.resellerId or tonumber(previousReservation.amountMinor) ~= tonumber(intended.amountMinor) then
    return cjson.encode({ok=false, code="IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_INPUT"})
  end
  return prior
end
if redis.call("EXISTS", KEYS[4]) == 1 then
  return cjson.encode({ok=false, code="RESERVATION_EXISTS"})
end
local available = tonumber(redis.call("HGET", KEYS[1], "availableMinor") or "0")
if available < tonumber(ARGV[1]) then
  return cjson.encode({ok=false, code="INSUFFICIENT_FUNDS", available=available})
end
redis.call("HINCRBY", KEYS[1], "availableMinor", -tonumber(ARGV[1]))
redis.call("HINCRBY", KEYS[1], "reservedMinor", tonumber(ARGV[1]))
local reservation = cjson.decode(ARGV[2])
redis.call("SET", KEYS[4], cjson.encode(reservation))
local entry = cjson.decode(ARGV[3])
redis.call("HSET", KEYS[2], entry.id, cjson.encode(entry))
local result = cjson.encode({ok=true, reservation=reservation})
redis.call("SET", KEYS[3], result)
return result
`;


const FUND_SCRIPT = `
local prior = redis.call("GET", KEYS[3])
if prior then
  local previous = cjson.decode(prior)
  local oldEntry = previous.entry
  local intended = cjson.decode(ARGV[2])
  if not oldEntry or oldEntry.resellerId ~= intended.resellerId or tonumber(oldEntry.amountMinor) ~= tonumber(intended.amountMinor) or oldEntry.memo ~= intended.memo then
    return cjson.encode({ok=false, code="IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_INPUT"})
  end
  return prior
end
local available = tonumber(redis.call("HGET", KEYS[1], "availableMinor") or "0")
if available > 9007199254740991 - tonumber(ARGV[1]) then
  return cjson.encode({ok=false, code="WALLET_BALANCE_LIMIT"})
end
redis.call("HINCRBY", KEYS[1], "availableMinor", tonumber(ARGV[1]))
local entry = cjson.decode(ARGV[2])
redis.call("HSET", KEYS[2], entry.id, cjson.encode(entry))
local result = cjson.encode({ok=true, entry=entry})
redis.call("SET", KEYS[3], result)
return result
`;

const RESOLVE_SCRIPT = `
local prior = redis.call("GET", KEYS[3])
if prior then return prior end
local raw = redis.call("GET", KEYS[2])
if not raw then return cjson.encode({ok=false, code="RESERVATION_NOT_FOUND"}) end
local reservation = cjson.decode(raw)
if reservation.state ~= "reserved" then
  return cjson.encode({ok=false, code="ALREADY_RESOLVED", state=reservation.state})
end
local amount = tonumber(reservation.amountMinor)
local reserved = tonumber(redis.call("HGET", KEYS[1], "reservedMinor") or "0")
if reserved < amount then return cjson.encode({ok=false, code="WALLET_INVARIANT_BROKEN"}) end
redis.call("HINCRBY", KEYS[1], "reservedMinor", -amount)
if ARGV[1] == "commit" then
  redis.call("HINCRBY", KEYS[1], "spentMinor", amount)
  reservation.state = "committed"
else
  redis.call("HINCRBY", KEYS[1], "availableMinor", amount)
  reservation.state = "released"
end
reservation.resolvedAt = tonumber(ARGV[2])
redis.call("SET", KEYS[2], cjson.encode(reservation))
local entry = cjson.decode(ARGV[3])
redis.call("HSET", KEYS[4], entry.id, cjson.encode(entry))
local result = cjson.encode({ok=true, reservation=reservation})
redis.call("SET", KEYS[3], result)
return result
`;

export async function creditFunds(input: { resellerId: string; amountMinor: number; memo: string; idempotency: string }): Promise<LedgerEntry> {
  assertPositiveInteger(input.amountMinor, "amountMinor");
  if (!input.resellerId || !input.idempotency) throw new Error("Missing funding identity.");
  const entry: LedgerEntry = {
    id: randomUUID(),
    resellerId: input.resellerId,
    kind: "funding",
    amountMinor: input.amountMinor,
    memo: input.memo.slice(0, 240),
    createdAt: Date.now(),
    idempotencyKey: input.idempotency
  };
  const raw = await redis.eval<string>(FUND_SCRIPT, [
    walletKey(input.resellerId),
    ledgerKey(input.resellerId),
    idempotencyKey("funding:" + input.idempotency)
  ], [String(input.amountMinor), JSON.stringify(entry)]);
  const result = parseScriptResult(raw);
  if (result.ok !== true) throw new Error(String(result.code || "FUNDING_FAILED"));
  return result.entry as LedgerEntry;
}

export async function getLedgerEntries(resellerId: string): Promise<LedgerEntry[]> {
  const values = await redis.hgetall<Record<string, string>>(ledgerKey(resellerId));
  return Object.values(values || {}).map(value => {
    try { return typeof value === "string" ? JSON.parse(value) as LedgerEntry : value as unknown as LedgerEntry; }
    catch { return null; }
  }).filter((entry): entry is LedgerEntry => Boolean(entry && typeof entry === "object" && "id" in entry))
    .sort((a, b) => b.createdAt - a.createdAt);
}

export async function getWallet(resellerId: string): Promise<WalletSnapshot> {
  const values = await redis.hgetall<Record<string, string>>(walletKey(resellerId));
  const numberOrZero = (value: unknown) => {
    const n = Number(value ?? 0);
    return Number.isSafeInteger(n) && n >= 0 ? n : 0;
  };
  return {
    resellerId,
    availableMinor: numberOrZero(values?.availableMinor),
    reservedMinor: numberOrZero(values?.reservedMinor),
    spentMinor: numberOrZero(values?.spentMinor)
  };
}

export async function reserveFunds(input: {
  resellerId: string;
  reservationId: string;
  amountMinor: number;
  memo: string;
  idempotency: string;
}): Promise<ReservationRecord> {
  assertPositiveInteger(input.amountMinor, "amountMinor");
  if (!input.resellerId || !input.reservationId || !input.idempotency) throw new Error("Missing reservation identity.");
  const now = Date.now();
  const reservation: ReservationRecord = {
    id: input.reservationId,
    resellerId: input.resellerId,
    amountMinor: input.amountMinor,
    state: "reserved",
    memo: input.memo.slice(0, 240),
    createdAt: now
  };
  const entry: LedgerEntry = {
    id: input.reservationId + ":reserve",
    resellerId: input.resellerId,
    reservationId: input.reservationId,
    kind: "reserve",
    amountMinor: input.amountMinor,
    memo: reservation.memo,
    createdAt: now,
    idempotencyKey: input.idempotency
  };
  const raw = await redis.eval<string>(RESERVE_SCRIPT, [
    walletKey(input.resellerId),
    ledgerKey(input.resellerId),
    idempotencyKey("reserve:" + input.idempotency),
    reservationKey(input.reservationId)
  ], [String(input.amountMinor), JSON.stringify(reservation), JSON.stringify(entry)]);
  const result = parseScriptResult(raw);
  if (result.ok !== true) throw new Error(String(result.code || "RESERVATION_FAILED"));
  return result.reservation as ReservationRecord;
}

async function resolveReservation(reservationId: string, action: "commit" | "release", idempotency: string): Promise<ReservationRecord> {
  if (!reservationId || !idempotency) throw new Error("Missing reservation resolution identity.");
  const rawReservation = await redis.get<ReservationRecord>(reservationKey(reservationId));
  if (!rawReservation) throw new Error("RESERVATION_NOT_FOUND");
  const now = Date.now();
  const entry: LedgerEntry = {
    id: reservationId + ":" + action,
    resellerId: rawReservation.resellerId,
    reservationId,
    kind: action,
    amountMinor: rawReservation.amountMinor,
    memo: rawReservation.memo,
    createdAt: now,
    idempotencyKey: idempotency
  };
  const raw = await redis.eval<string>(RESOLVE_SCRIPT, [
    walletKey(rawReservation.resellerId),
    reservationKey(reservationId),
    idempotencyKey(action + ":" + idempotency),
    ledgerKey(rawReservation.resellerId)
  ], [action, String(now), JSON.stringify(entry)]);
  const result = parseScriptResult(raw);
  if (result.ok !== true) throw new Error(String(result.code || "RESOLUTION_FAILED"));
  return result.reservation as ReservationRecord;
}

export function commitReservation(reservationId: string, idempotency: string) {
  return resolveReservation(reservationId, "commit", idempotency);
}

export function releaseReservation(reservationId: string, idempotency: string) {
  return resolveReservation(reservationId, "release", idempotency);
}

export async function getReservation(reservationId: string): Promise<ReservationRecord | null> {
  return await redis.get<ReservationRecord>(reservationKey(reservationId)) ?? null;
}

export function newReservationId() {
  return randomUUID();
}