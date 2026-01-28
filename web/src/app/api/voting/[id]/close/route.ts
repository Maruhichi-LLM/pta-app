import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { VotingStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSessionFromCookies } from "@/lib/session";
import { ensureModuleEnabled } from "@/lib/modules";
import { ROLE_ADMIN } from "@/lib/roles";
import { assertWriteRequestSecurity } from "@/lib/security";
import { buildResultsFromCounts } from "@/lib/voting";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSessionFromCookies();
  const guard = assertWriteRequestSecurity(request, {
    memberId: session?.memberId,
  });
  if (guard) return guard;
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

  const [voting, member] = await Promise.all([
    prisma.voting.findFirst({
      where: { id: votingId, groupId: session.groupId },
      select: {
        id: true,
        createdByMemberId: true,
        options: true,
        status: true,
      },
    }),
    prisma.member.findUnique({
      where: { id: session.memberId },
      select: { role: true },
    }),
  ]);
  if (!voting) {
    return NextResponse.json(
      { error: "投票が見つかりません。" },
      { status: 404 }
    );
  }
  const isAdmin = member?.role === ROLE_ADMIN;
  if (!isAdmin && voting.createdByMemberId !== session.memberId) {
    return NextResponse.json(
      { error: "締切権限がありません。" },
      { status: 403 }
    );
  }

  if (voting.status === VotingStatus.CLOSED) {
    return NextResponse.json({ success: true });
  }

  const counts = await prisma.votingVote.groupBy({
    by: ["choiceId"],
    where: { votingId },
    _count: { _all: true },
  });
  const countMap: Record<string, number> = {};
  counts.forEach((item) => {
    countMap[item.choiceId] = item._count._all;
  });
  const options = Array.isArray(voting.options)
    ? (voting.options as { id: string; label: string }[])
    : [];
  const { results, total } = buildResultsFromCounts(options, countMap);

  await prisma.voting.update({
    where: { id: votingId },
    data: {
      status: VotingStatus.CLOSED,
      results,
      totalVotes: total,
    },
  });

  revalidatePath("/voting");
  revalidatePath(`/voting/${votingId}`);

  return NextResponse.json({ success: true });
}
