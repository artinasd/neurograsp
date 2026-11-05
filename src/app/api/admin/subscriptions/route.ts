import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getOwnerSession } from "@/lib/auth/session";
import { listPanels } from "@/lib/panels/store";
import { getPasarGuardSubscriptionUrl } from "@/lib/panels/pasarguard";
import { createMasterSubscription, listMasterSubscriptions } from "@/lib/subscriptions/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  username: z.string().trim().min(3).max(64).regex(/^[A-Za-z0-9_-]+$/),
  panelId: z.string().uuid()
});

export async function GET() {
  if (!await getOwnerSession()) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ subscriptions: await listMasterSubscriptions() }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: NextRequest) {
  if (!await getOwnerSession()) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const origin = request.headers.get("origin");
  if (origin && origin !== request.nextUrl.origin) return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || "Invalid subscription." }, { status: 400 });
  const panels = await listPanels();
  if (!panels.some(panel => panel.id === parsed.data.panelId)) return NextResponse.json({ error: "Selected panel is not configured." }, { status: 400 });
  try {
    // Verify that the exact account exists and exposes a supported native subscription URL.
    await getPasarGuardSubscriptionUrl(parsed.data.panelId, parsed.data.username);
    const created = await createMasterSubscription(parsed.data);
    const appUrl = request.nextUrl.origin.replace(/\/$/, "");
    return NextResponse.json({ subscription: created.subscription, url: appUrl + "/sub/" + created.token }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not create subscription link." }, { status: 400 });
  }
}
