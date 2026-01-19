import { NextResponse } from "next/server";
import { buildClearSessionCookie } from "@/lib/session";

export async function POST() {
  const response = NextResponse.json({ success: true });
  response.cookies.set(buildClearSessionCookie());
  return response;
}
