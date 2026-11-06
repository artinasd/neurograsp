import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getEnv } from "@/lib/env";
import { redis, KEYS } from "@/lib/db/redis";
import { hashPassword } from "@/lib/auth/password";
import { createOwnerSession, SESSION_COOKIE } from "@/lib/auth/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const setupSchema = z.object({
  username: z.string().trim().min(3).max(32).regex(/^[a-zA-Z0-9_-]+$/),
  password: z.string().min(12).max(128),
  confirmPassword: z.string().min(12).max(128)
}).refine(value => value.password === value.confirmPassword, {
  path: ["confirmPassword"],
  message: "Passwords do not match."
});
const SETUP_WINDOW_SECONDS = 15 * 60;
const SETUP_MAX_ATTEMPTS = 5;

function isSameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    return new URL(origin).origin === new URL(getEnv().APP_URL).origin;
  } catch {
    return false;
  }
}

function rateLimitKey(request: NextRequest) {
  const address = request.headers.get("x-real-ip") ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const digest = createHash("sha256").update(address).digest("hex");
  return "ng:setup-limit:v1:" + digest;
}

async function consumeSetupAttempt(key: string) {
  const script = `
    local count = redis.call("INCR", KEYS[1])
    if count == 1 then redis.call("EXPIRE", KEYS[1], ARGV[1]) end
    return count
  `;
  return Number(await redis.eval(script, [key], [String(SETUP_WINDOW_SECONDS)]));
}

export async function GET() {
  try {
    const owner = await redis.get(KEYS.owner);
    return NextResponse.json({ setupRequired: !owner }, {
      headers: { "Cache-Control": "no-store" }
    });
  } catch {
    return NextResponse.json({ error: "Setup status unavailable." }, { status: 503 });
  }
}

export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) {
    return NextResponse.json({ error: "Origin check failed." }, { status: 403 });
  }

  const parsed = setupSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid setup request." }, { status: 400 });
  }

  try {
    if (await redis.get(KEYS.owner)) {
      return NextResponse.json({ error: "Owner setup has already been completed." }, { status: 409 });
    }

    const key = rateLimitKey(request);
    if (await consumeSetupAttempt(key) > SETUP_MAX_ATTEMPTS) {
      return NextResponse.json({ error: "Too many setup attempts. Try again in 15 minutes." }, {
        status: 429,
        headers: { "Cache-Control": "no-store", "Retry-After": String(SETUP_WINDOW_SECONDS) }
      });
    }

    const passwordHash = await hashPassword(parsed.data.password);
    const ownerRecord = {
      username: parsed.data.username,
      passwordHash,
      createdAt: new Date().toISOString()
    };

    const result = await redis.set(KEYS.owner, ownerRecord, { nx: true });
    if (result !== "OK") {
      return NextResponse.json({ error: "Owner setup has already been completed." }, { status: 409 });
    }

    await redis.set(KEYS.setupMeta, { schemaVersion: 1, setupComplete: true });
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
    return NextResponse.json({ error: "Could not complete owner setup. Check server configuration." }, { status: 503 });
  }
}
