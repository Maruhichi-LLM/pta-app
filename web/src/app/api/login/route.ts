import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { buildSessionCookie } from "@/lib/session";
import {
  assertSameOrigin,
  CSRF_ERROR_MESSAGE,
  RATE_LIMIT_ERROR_MESSAGE,
  checkRateLimit,
  getRateLimitRule,
  buildRateLimitKey,
} from "@/lib/security";

type LoginRequest = {
  email?: string;
  password?: string;
};

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export async function POST(request: Request) {
  const csrf = assertSameOrigin(request);
  if (!csrf.ok) {
    return NextResponse.json(
      { error: CSRF_ERROR_MESSAGE },
      { status: 403 }
    );
  }

  const { limit, windowSec } = getRateLimitRule("login");
  const rate = checkRateLimit({
    key: buildRateLimitKey({
      scope: "login",
      request,
      action: "login",
    }),
    limit,
    windowSec,
  });
  if (!rate.ok) {
    return NextResponse.json(
      { error: RATE_LIMIT_ERROR_MESSAGE },
      {
        status: 429,
        headers: rate.retryAfterSec
          ? { "Retry-After": String(rate.retryAfterSec) }
          : undefined,
      }
    );
  }

  const body = ((await request.json().catch(() => ({}))) ??
    {}) as LoginRequest;
  const emailRaw = body.email?.trim();
  const password = body.password;

  if (!emailRaw || !password) {
    return NextResponse.json(
      { error: "メールアドレスとパスワードを入力してください。" },
      { status: 400 }
    );
  }

  const email = normalizeEmail(emailRaw);

  const member = await prisma.member.findUnique({
    where: { email },
  });

  if (!member || !member.passwordHash) {
    return NextResponse.json(
      { error: "メールアドレスまたはパスワードが正しくありません。" },
      { status: 400 }
    );
  }

  const valid = await bcrypt.compare(password, member.passwordHash);
  if (!valid) {
    return NextResponse.json(
      { error: "メールアドレスまたはパスワードが正しくありません。" },
      { status: 400 }
    );
  }

  const response = NextResponse.json({ success: true });
  response.cookies.set(
    buildSessionCookie({ memberId: member.id, groupId: member.groupId })
  );

  return response;
}
