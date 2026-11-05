import { NextRequest, NextResponse } from "next/server";
import { getMasterSubscriptionByToken } from "@/lib/subscriptions/store";
import { fetchNativePasarGuardSubscription } from "@/lib/panels/pasarguard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: NextRequest, context: { params: { token: string } }) {
  const mapping = await getMasterSubscriptionByToken(context.params.token);
  if (!mapping) return new Response("Subscription not found", { status: 404, headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" } });
  try {
    return await fetchNativePasarGuardSubscription(mapping.panelId, mapping.username, request);
  } catch {
    return NextResponse.json({ error: "Subscription upstream is temporarily unavailable." }, { status: 502, headers: { "Cache-Control": "no-store" } });
  }
}
