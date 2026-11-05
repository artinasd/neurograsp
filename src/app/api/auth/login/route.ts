import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { redis, KEYS } from "@/lib/db/redis";
import { verifyPassword } from "@/lib/auth/password";
import { createOwnerSession, SESSION_COOKIE } from "@/lib/auth/session";
import { getEnv } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  username: z.string().trim().min(1).max(32),
  password: z.string().min(1).max(128)
});
const LOGIN_WINDOW_SECONDS = 15 * 60;
const LOGIN_MAX_ATTEMPTS = 10;

function sameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try { return new URL(origin).origin === new URL(getEnv().APP_URL).origin; }
  catch { return false; }
}

function rateLimitKey(request: NextRequest) {
  // Vercel supplies x-real-ip at the edge; fall back to the first forwarded
  // address for other reverse-proxy deployments. Store only a digest.
  const address = request.headers.get("x-real-ip") ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const digest = createHash("sha256").update(address).digest("hex");
  return "ng:login-limit:v1:" + digest;
}

async function consumeLoginAttempt(key: string) {
  const script = `
    local count = redis.call("INCR", KEYS[1])
    if count == 1 then redis.call("EXPIRE", KEYS[1], ARGV[1]) end
    return count
  `;
  return Number(await redis.eval(script, [key], [String(LOGIN_WINDOW_SECONDS)]));
}

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "Origin check failed." }, { status: 403 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid login request." }, { status: 400 });

  try {
    const key = rateLimitKey(request);
    if (await consumeLoginAttempt(key) > LOGIN_MAX_ATTEMPTS) {
      return NextResponse.json({ error: "Too many login attempts. Try again in 15 minutes." }, {
        status: 429,
        headers: { "Cache-Control": "no-store", "Retry-After": String(LOGIN_WINDOW_SECONDS) }
      });
    }
    const owner = await redis.get<{ username?: string; passwordHash?: string }>(KEYS.owner);
    if (!owner || owner.username !== parsed.data.username || !owner.passwordHash ||
        !(await verifyPassword(parsed.data.password, owner.passwordHash))) {
      return NextResponse.json({ error: "Invalid username or password." }, { status: 401 });
    }

    const session = await createOwnerSession();
    const response = NextResponse.json({ success: true, redirectTo: "/admin" }, {
      headers: { "Cache-Control": "no-store" }
    });
    response.cookies.set(SESSION_COOKIE, session.token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/",
      maxAge: session.maxAge
    });
    return response;
  } catch {
    return NextResponse.json({ error: "Authentication service unavailable." }, { status: 503 });
  }
}
