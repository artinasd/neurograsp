import { NextRequest, NextResponse } from "next/server";
import { getOwnerSession } from "@/lib/auth/session";
import { deletePanel } from "@/lib/panels/store";

export const runtime = "nodejs";
export async function DELETE(request: NextRequest, context: { params: { id: string } }) {
  if (!await getOwnerSession()) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const origin = request.headers.get("origin");
  if (origin && origin !== request.nextUrl.origin) return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
  try {
    await deletePanel(context.params.id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to delete panel." }, { status: 404 });
  }
}
