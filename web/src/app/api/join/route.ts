import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { buildSessionCookie } from "@/lib/session";
import { ROLE_MEMBER } from "@/lib/roles";
import {
  assertSameOrigin,
  CSRF_ERROR_MESSAGE,
  RATE_LIMIT_ERROR_MESSAGE,
  checkRateLimit,
  getRateLimitRule,
  buildRateLimitKey,
} from "@/lib/security";

type JoinRequest = {
  code?: string;
  displayName?: string;
  email?: string;
  password?: string;
};

export async function POST(request: Request) {
  const csrf = assertSameOrigin(request);
  if (!csrf.ok) {
    return NextResponse.json(
      { error: CSRF_ERROR_MESSAGE },
      { status: 403 }
    );
  }

  const { limit, windowSec } = getRateLimitRule("write");
  const rate = checkRateLimit({
    key: buildRateLimitKey({
      scope: "write",
      request,
      action: "join",
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

  const body = ((await request.json().catch(() => ({}))) ?? {}) as JoinRequest;
  const code = body.code?.trim().toUpperCase();
  const displayName = body.displayName?.trim();
  const emailRaw = body.email?.trim();
  const password = body.password;

  if (!code || !displayName || !emailRaw || !password) {
    return NextResponse.json(
      {
        error:
          "招待コード、表示名、メールアドレス、パスワードを入力してください。",
      },
      { status: 400 }
    );
  }

  const email = emailRaw.toLowerCase();

  const existing = await prisma.member.findUnique({
    where: { email },
  });
  if (existing) {
    return NextResponse.json(
      { error: "このメールアドレスは既に使用されています。" },
      { status: 400 }
    );
  }

  const invite = await prisma.inviteCode.findUnique({
    where: { code },
  });

  if (
    !invite ||
    (invite.expiresAt && invite.expiresAt < new Date()) ||
    invite.usedAt
  ) {
    return NextResponse.json(
      { error: "使用できる招待コードが見つかりません。" },
      { status: 400 }
    );
  }

  const passwordHash = await bcrypt.hash(password, 10);

  const member = await prisma.$transaction(async (tx) => {
    const createdMember = await tx.member.create({
      data: {
        groupId: invite.groupId,
        displayName,
        role: invite.role ?? ROLE_MEMBER,
        email,
        passwordHash,
      },
    });

    await tx.inviteCode.update({
      where: { id: invite.id },
      data: {
        usedAt: new Date(),
        usedByMemberId: createdMember.id,
      },
    });

    return createdMember;
  });

  const response = NextResponse.json({
    success: true,
    memberId: member.id,
    groupId: member.groupId,
  });

  response.cookies.set(
    buildSessionCookie({ memberId: member.id, groupId: member.groupId })
  );

  return response;
}
