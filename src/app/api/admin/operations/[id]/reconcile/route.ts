import { NextRequest, NextResponse } from "next/server";
import { getOwnerSession } from "@/lib/auth/session";
import { getEnv } from "@/lib/env";
import { getOperation } from "@/lib/provisioning/store";
import { acquireOperationLock, releaseOperationLock } from "@/lib/provisioning/lock";
import { runProvisioningOperation } from "@/lib/provisioning/runner";
import { createMasterSubscription } from "@/lib/subscriptions/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest, context: { params: { id: string } }) {
  if (!await getOwnerSession()) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const origin = request.headers.get("origin");
  if (origin && origin !== request.nextUrl.origin) return NextResponse.json({ error: "Invalid origin" }, { status: 403 });

  const existing = await getOperation(context.params.id);
  if (!existing) return NextResponse.json({ error: "Operation not found." }, { status: 404 });
  if (existing.state === "completed" || existing.state === "failed") {
    return NextResponse.json({ operation: existing }, { status: 409 });
  }

  const token = await acquireOperationLock(context.params.id);
  if (!token) return NextResponse.json({ error: "This operation is already being processed." }, { status: 409 });

  try {
    const operation = await runProvisioningOperation(context.params.id);
    if (operation.state === "completed") {
      const master = await createMasterSubscription({
        operationId: operation.id,
        username: operation.username,
        panelId: operation.panelIds[0],
        panelIds: operation.panelIds
      });
      const url = getEnv().APP_URL.replace(/\/$/, "") + "/sub/" + master.token;
      return NextResponse.json({ operation, masterSubscription: master.subscription, url }, { status: 200, headers: { "Cache-Control": "no-store" } });
    }
    return NextResponse.json({ operation }, { status: 202, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Reconciliation failed." }, { status: 502 });
  } finally {
    await releaseOperationLock(context.params.id, token);
  }
}
