import { NextResponse } from "next/server";
import { VotingStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSessionFromCookies } from "@/lib/session";
import { ensureModuleEnabled } from "@/lib/modules";
import { buildVoteHash } from "@/lib/voting";
import { ROLE_ADMIN } from "@/lib/roles";

async function closeIfNeeded(votingId: number, groupId: number) {
  const voting = await prisma.voting.findFirst({
    where: { id: votingId, groupId },
    select: {
      id: true,
      status: true,
      deadlineAt: true,
      options: true,
    },
  });
  if (!voting) return null;

  const now = new Date();
  if (voting.status === VotingStatus.OPEN && voting.deadlineAt) {
    if (voting.deadlineAt.getTime() <= now.getTime()) {
      const counts = await prisma.votingVote.groupBy({
        by: ["choiceId"],
        where: { votingId },
        _count: { _all: true },
      });
      const results: Record<string, number> = {};
      let totalVotes = 0;
      const options = Array.isArray(voting.options)
        ? (voting.options as { id: string }[])
        : [];
      counts.forEach((item) => {
        results[item.choiceId] = item._count._all;
        totalVotes += item._count._all;
      });
      options.forEach((option) => {
        if (results[option.id] === undefined) {
          results[option.id] = 0;
        }
      });
      await prisma.voting.update({
        where: { id: votingId },
        data: {
          status: VotingStatus.CLOSED,
          results,
          totalVotes,
        },
      });
    }
  }
  return prisma.voting.findFirst({
    where: { id: votingId, groupId },
    include: {
      comments: {
        orderBy: { createdAt: "desc" },
      },
    },
  });
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSessionFromCookies();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  await ensureModuleEnabled(session.groupId, "voting");

  const { id } = await params;
  const votingId = Number(id);
  if (!Number.isInteger(votingId)) {
    return NextResponse.json(
      { error: "投票が見つかりません。" },
      { status: 404 }
    );
  }

  const voting = await closeIfNeeded(votingId, session.groupId);
  if (!voting) {
    return NextResponse.json(
      { error: "投票が見つかりません。" },
      { status: 404 }
    );
  }

  const member = await prisma.member.findUnique({
    where: { id: session.memberId },
    select: { role: true },
  });
  const canManage =
    member?.role === ROLE_ADMIN ||
    voting.createdByMemberId === session.memberId;

  let hasVoted = false;
  try {
    const voteHash = buildVoteHash(votingId, session.memberId);
    const existing = await prisma.votingVote.findUnique({
      where: {
        votingId_voteHash: {
          votingId,
          voteHash,
        },
      },
      select: { id: true },
    });
    hasVoted = Boolean(existing);
  } catch {
    return NextResponse.json(
      { error: "投票の判定に失敗しました。" },
      { status: 500 }
    );
  }

  return NextResponse.json({
    voting,
    comments: voting.comments,
    hasVoted,
    canManage,
  });
}
