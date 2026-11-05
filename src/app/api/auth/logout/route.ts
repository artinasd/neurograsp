import { NextRequest, NextResponse } from "next/server";
import { destroyOwnerSession, SESSION_COOKIE } from "@/lib/auth/session";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    await destroyOwnerSession();
    const response = NextResponse.redirect(new URL("/login", request.url), 303);
    response.cookies.set(SESSION_COOKIE, "", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/",
      maxAge: 0
    });
    return response;
  } catch {
    return NextResponse.json({ error: "Could not end the session." }, { status: 503 });
  }
}