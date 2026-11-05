import { randomUUID } from "node:crypto";
import { redis } from "@/lib/db/redis";

const lockKey = (id: string) => "ng:operation-lock:v1:" + id;
const LOCK_TTL_SECONDS = 180;

export async function acquireOperationLock(operationId: string) {
  const token = randomUUID();
  const result = await redis.set(lockKey(operationId), token, { nx: true, ex: LOCK_TTL_SECONDS });
  return result === "OK" ? token : null;
}

export async function releaseOperationLock(operationId: string, token: string) {
  const script = `
    if redis.call("GET", KEYS[1]) == ARGV[1] then
      return redis.call("DEL", KEYS[1])
    end
    return 0
  `;
  await redis.eval(script, [lockKey(operationId)], [token]);
}
