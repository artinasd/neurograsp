import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { redis, KEYS } from "@/lib/db/redis";

export const SESSION_COOKIE = "neurograsp_session";
const SESSION_TTL_SECONDS = 60 * 60 * 12;

function digest(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function createOwnerSession() {
  const token = randomBytes(32).toString("base64url");
  const sessionId = digest(token);
  await redis.set(KEYS.sessionPrefix + sessionId, { role: "owner", createdAt: Date.now() }, {
    ex: SESSION_TTL_SECONDS
  });
  return { token, maxAge: SESSION_TTL_SECONDS };
}

export async function getOwnerSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token || token.length > 128) return null;
  const record = await redis.get<{ role?: string }>(KEYS.sessionPrefix + digest(token));
  return record?.role === "owner" ? { role: "owner" as const } : null;
}

export async function destroyOwnerSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (token && token.length <= 128) {
    await redis.del(KEYS.sessionPrefix + digest(token));
  }
  cookieStore.delete(SESSION_COOKIE);
}