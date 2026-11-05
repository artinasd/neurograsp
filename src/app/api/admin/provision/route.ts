import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getOwnerSession } from "@/lib/auth/session";
import { getReservation } from "@/lib/ledger/wallet";
import { listPanels } from "@/lib/panels/store";
import { createOperation, getOperationByIdempotency, newOperationId } from "@/lib/provisioning/store";
import { runProvisioningOperation } from "@/lib/provisioning/runner";
import { acquireOperationLock, releaseOperationLock } from "@/lib/provisioning/lock";
import { createMasterSubscription } from "@/lib/subscriptions/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  idempotencyKey: z.string().trim().min(12).max(160),
  reservationId: z.string().uuid(),
  username: z.string().trim().min(3).max(64).regex(/^[A-Za-z0-9_-]+$/),
  dataQuotaGb: z.number().positive().max(10000),
  expireAt: z.number().int().positive(),
  panelIds: z.array(z.string().uuid()).min(1).max(20),
  note: z.string().max(240).optional().default("Managed by Neurograsp")
});

export async function POST(request: NextRequest) {
  if (!await getOwnerSession()) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const origin = request.headers.get("origin");
  if (origin && origin !== request.nextUrl.origin) return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || "Invalid provisioning request." }, { status: 400 });

  const input = parsed.data;
  if (input.expireAt <= Math.floor(Date.now() / 1000)) return NextResponse.json({ error: "Expiration must be in the future." }, { status: 400 });
  const bytes = Math.round(input.dataQuotaGb * 1_000_000_000);
  if (!Number.isSafeInteger(bytes) || bytes <= 0) return NextResponse.json({ error: "Quota is outside the supported byte range." }, { status: 400 });
  const panelIds = [...new Set(input.panelIds)];
  if (panelIds.length !== input.panelIds.length) return NextResponse.json({ error: "Panel IDs must be unique." }, { status: 400 });

  const snapshot = {
    username: input.username,
    dataLimitBytes: bytes,
    expireAt: input.expireAt,
    status: "active" as const,
    note: input.note,
    groupIds: [] as number[]
  };
  const existingOperation = await getOperationByIdempotency(input.idempotencyKey);
  if (existingOperation && (
    existingOperation.username !== input.username ||
    existingOperation.reservationId !== input.reservationId ||
    existingOperation.panelIds.join("|") !== panelIds.join("|") ||
    JSON.stringify(existingOperation.snapshot) !== JSON.stringify(snapshot)
  )) {
    return NextResponse.json({ error: "IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_INPUT" }, { status: 409 });
  }

  if (!existingOperation) {
    const reservation = await getReservation(input.reservationId);
    if (!reservation || reservation.state !== "reserved") {
      return NextResponse.json({ error: "A valid reserved wallet amount is required before provisioning." }, { status: 409 });
    }
  }
  const connected = await listPanels();
  if (panelIds.some(id => !connected.some(panel => panel.id === id))) {
    return NextResponse.json({ error: "Every selected panel must be configured." }, { status: 400 });
  }

  try {
    const operation = await createOperation({
      id: existingOperation?.id ?? newOperationId(),
      idempotencyKey: input.idempotencyKey,
      reservationId: input.reservationId,
      username: input.username,
      panelIds,
      snapshot
    });
    const lock = await acquireOperationLock(operation.id);
    if (!lock) return NextResponse.json({ error: "This operation is already being processed." }, { status: 409 });
    try {
      const current = await runProvisioningOperation(operation.id);
      const status = current.state === "completed" ? 200 : current.state === "failed" ? 502 : 202;
      if (current.state === "completed") {
        const master = await createMasterSubscription({
          operationId: current.id,
          username: current.username,
          panelId: current.panelIds[0],
          panelIds: current.panelIds
        });
        const url = request.nextUrl.origin.replace(/\/$/, "") + "/sub/" + master.token;
        return NextResponse.json({ operation: current, masterSubscription: master.subscription, url }, { status, headers: { "Cache-Control": "no-store" } });
      }
      return NextResponse.json({ operation: current }, { status, headers: { "Cache-Control": "no-store" } });
    } finally {
      await releaseOperationLock(operation.id, lock);
    }
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Provisioning could not be started." }, { status: 502 });
  }
}
