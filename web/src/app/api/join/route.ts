import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { buildSessionCookie } from "@/lib/session";

type JoinRequest = {
  code?: string;
  displayName?: string;
};

export async function POST(request: Request) {
  const body = ((await request.json().catch(() => ({}))) ?? {}) as JoinRequest;
  const code = body.code?.trim().toUpperCase();
  const displayName = body.displayName?.trim();

  if (!code || !displayName) {
    return NextResponse.json(
      { error: "招待コードと表示名を入力してください。" },
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

  const member = await prisma.$transaction(async (tx) => {
    const createdMember = await tx.member.create({
      data: {
        groupId: invite.groupId,
        displayName,
        role: invite.role ?? "member",
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
