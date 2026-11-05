import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getOwnerSession } from "@/lib/auth/session";
import { listPanels, savePanel } from "@/lib/panels/store";
import { validatePanelBaseUrl } from "@/lib/panels/url";

export const runtime = "nodejs";
const schema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1).max(80),
  baseUrl: z.string().url(),
  username: z.string().max(256).optional().default(""),
  password: z.string().max(512).optional().default(""),
  groupIds: z.array(z.number().int().positive()).max(100).default([])
});

function sameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  return !origin || origin === request.nextUrl.origin;
}

export async function GET() {
  if (!await getOwnerSession()) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ panels: await listPanels() }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: NextRequest) {
  if (!await getOwnerSession()) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!sameOrigin(request)) return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid panel fields." }, { status: 400 });
  try {
    const baseUrl = await validatePanelBaseUrl(parsed.data.baseUrl);
    const saved = await savePanel({ ...parsed.data, baseUrl });
    return NextResponse.json({ panel: saved }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to save panel." }, { status: 400 });
  }
}
