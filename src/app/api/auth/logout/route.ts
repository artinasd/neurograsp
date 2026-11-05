import { NextResponse } from "next/server";
import { destroyOwnerSession } from "@/lib/auth/session";

export const runtime = "nodejs";

export async function POST() {
  try {
    await destroyOwnerSession();
    return NextResponse.json({ success: true }, {
      headers: { "Cache-Control": "no-store" }
    });
  } catch {
    return NextResponse.json({ error: "Could not end the session." }, { status: 503 });
  }
}