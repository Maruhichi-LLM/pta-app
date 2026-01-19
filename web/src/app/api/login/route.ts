import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { buildSessionCookie } from "@/lib/session";

type LoginRequest = {
  email?: string;
  password?: string;
};

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export async function POST(request: Request) {
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
