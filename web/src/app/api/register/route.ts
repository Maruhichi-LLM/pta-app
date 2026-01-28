import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { buildSessionCookie } from "@/lib/session";
import { ROLE_ADMIN } from "@/lib/roles";
import { assertWriteRequestSecurity } from "@/lib/security";

type RegisterRequest = {
  organizationName?: string;
  fiscalYearStartMonth?: number;
  displayName?: string;
  email?: string;
  password?: string;
};

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export async function POST(request: Request) {
  const guard = assertWriteRequestSecurity(request, {
    rateKey: "register",
  });
  if (guard) return guard;

  const body = ((await request.json().catch(() => ({}))) ??
    {}) as RegisterRequest;
  const name = body.organizationName?.trim();
  const fiscalYearStartMonth = body.fiscalYearStartMonth;
  const displayName = body.displayName?.trim();
  const emailRaw = body.email?.trim();
  const password = body.password;

  if (
    !name ||
    !displayName ||
    !emailRaw ||
    !password ||
    !fiscalYearStartMonth ||
    fiscalYearStartMonth < 1 ||
    fiscalYearStartMonth > 12
  ) {
    return NextResponse.json(
      { error: "すべての項目を入力してください。" },
      { status: 400 }
    );
  }

  const email = normalizeEmail(emailRaw);

  const existing = await prisma.member.findUnique({
    where: { email },
  });
  if (existing) {
    return NextResponse.json(
      { error: "このメールアドレスは既に使用されています。" },
      { status: 400 }
    );
  }

  const group = await prisma.group.create({
    data: {
      name,
      fiscalYearStartMonth,
      enabledModules: ["event", "calendar", "accounting"],
    },
  });

  const passwordHash = await bcrypt.hash(password, 10);

  const member = await prisma.member.create({
    data: {
      groupId: group.id,
      displayName,
      role: ROLE_ADMIN,
      email,
      passwordHash,
    },
  });

  const response = NextResponse.json({
    success: true,
    groupId: group.id,
  });

  response.cookies.set(
    buildSessionCookie({ memberId: member.id, groupId: group.id })
  );

  return response;
}
