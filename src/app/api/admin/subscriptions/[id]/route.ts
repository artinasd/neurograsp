import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getOwnerSession } from "@/lib/auth/session";
import { listPanels } from "@/lib/panels/store";
import { getPasarGuardSubscriptionUrl } from "@/lib/panels/pasarguard";
import { updateMasterSubscriptionPanel } from "@/lib/subscriptions/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({ panelId: z.string().uuid() });

export async function PATCH(request: NextRequest, context: { params: { id: string } }) {
  if (!await getOwnerSession()) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const origin = request.headers.get("origin");
  if (origin && origin !== request.nextUrl.origin) return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "A valid panel ID is required." }, { status: 400 });
  const panels = await listPanels();
  if (!panels.some(panel => panel.id === parsed.data.panelId)) return NextResponse.json({ error: "Selected panel is not configured." }, { status: 400 });
  try {
    // Confirm that this username exists on the destination panel before switching.
    const subscriptions = await import("@/lib/subscriptions/store").then(module => module.listMasterSubscriptions());
    const current = subscriptions.find(item => item.id === context.params.id);
    if (!current) return NextResponse.json({ error: "Master subscription not found." }, { status: 404 });
    await getPasarGuardSubscriptionUrl(parsed.data.panelId, current.username);
    const updated = await updateMasterSubscriptionPanel(current.id, parsed.data.panelId);
    return NextResponse.json({ subscription: updated }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not switch selected panel." }, { status: 400 });
  }
}
