import { NextRequest, NextResponse } from "next/server";
import { getOwnerSession } from "@/lib/auth/session";
import { getOperation } from "@/lib/provisioning/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: NextRequest, context: { params: { id: string } }) {
  if (!await getOwnerSession()) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const operation = await getOperation(context.params.id);
  if (!operation) return NextResponse.json({ error: "Operation not found." }, { status: 404 });
  return NextResponse.json({ operation }, { headers: { "Cache-Control": "no-store" } });
}
