import { NextResponse } from "next/server";
import { buildClearSessionCookie } from "@/lib/session";
import { assertWriteRequestSecurity } from "@/lib/security";

export async function POST(request: Request) {
  const guard = assertWriteRequestSecurity(request, {
    rateKey: "logout",
  });
  if (guard) return guard;

  const response = NextResponse.json({ success: true });
  response.cookies.set(buildClearSessionCookie());
  return response;
}
