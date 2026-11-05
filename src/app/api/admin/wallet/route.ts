import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getOwnerSession } from "@/lib/auth/session";
import { DEFAULT_RESELLER_ID } from "@/lib/ledger/reseller";
import { creditFunds, getLedgerEntries, getWallet, newReservationId, reserveFunds } from "@/lib/ledger/wallet";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const common = {
  amountMinor: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  memo: z.string().trim().min(1).max(240),
  idempotencyKey: z.string().trim().min(12).max(160)
};
const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("fund"), ...common }),
  z.object({ action: z.literal("reserve"), ...common })
]);

export async function GET() {
  if (!await getOwnerSession()) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const [wallet, entries] = await Promise.all([
    getWallet(DEFAULT_RESELLER_ID),
    getLedgerEntries(DEFAULT_RESELLER_ID)
  ]);
  return NextResponse.json({ wallet, entries }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: NextRequest) {
  if (!await getOwnerSession()) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const origin = request.headers.get("origin");
  if (origin && origin !== request.nextUrl.origin) return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || "Invalid wallet action." }, { status: 400 });
  try {
    if (parsed.data.action === "fund") {
      const entry = await creditFunds({ resellerId: DEFAULT_RESELLER_ID, amountMinor: parsed.data.amountMinor, memo: parsed.data.memo, idempotency: parsed.data.idempotencyKey });
      return NextResponse.json({ entry, wallet: await getWallet(DEFAULT_RESELLER_ID) }, { status: 200, headers: { "Cache-Control": "no-store" } });
    }
    const reservation = await reserveFunds({
      resellerId: DEFAULT_RESELLER_ID,
      reservationId: newReservationId(parsed.data.idempotencyKey),
      amountMinor: parsed.data.amountMinor,
      memo: parsed.data.memo,
      idempotency: parsed.data.idempotencyKey
    });
    return NextResponse.json({ reservation, wallet: await getWallet(DEFAULT_RESELLER_ID) }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Wallet action failed." }, { status: 409 });
  }
}
