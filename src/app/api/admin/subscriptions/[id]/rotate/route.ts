import { NextRequest, NextResponse } from "next/server";
import { getOwnerSession } from "@/lib/auth/session";
import { getEnv } from "@/lib/env";
import { rotateMasterSubscriptionToken } from "@/lib/subscriptions/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest, context: { params: { id: string } }) {
  if (!await getOwnerSession()) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const origin = request.headers.get("origin");
  if (origin && origin !== request.nextUrl.origin) return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
  const rotated = await rotateMasterSubscriptionToken(context.params.id);
  if (!rotated) return NextResponse.json({ error: "Master subscription not found." }, { status: 404 });
  const appUrl = getEnv().APP_URL.replace(/\/$/, "");
  return NextResponse.json({ subscription: rotated.subscription, url: appUrl + "/sub/" + rotated.token }, { headers: { "Cache-Control": "no-store" } });
}
