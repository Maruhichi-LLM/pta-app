import { NextResponse } from "next/server";
import { Prisma, VotingStatus } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getSessionFromCookies } from "@/lib/session";
import { ensureModuleEnabled } from "@/lib/modules";
import { assertWriteRequestSecurity } from "@/lib/security";
import { buildVoteHash, buildResultsFromCounts } from "@/lib/voting";
import { captureApiException, setApiSentryContext } from "@/lib/sentry";

type VotePayload = {
  choiceId?: string;
};

export async function POST(
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

  const routePath = new URL(request.url).pathname;
  const sentryContext = {
    module: "voting",
    action: "voting-vote",
    route: routePath,
    method: request.method,
    groupId: session.groupId,
    memberId: session.memberId,
    entity: { votingId },
  } as const;
  setApiSentryContext(sentryContext);

  const voting = await prisma.voting.findFirst({
    where: { id: votingId, groupId: session.groupId },
    select: {
      id: true,
      status: true,
      deadlineAt: true,
      options: true,
    },
  });
  if (!voting) {
    return NextResponse.json(
      { error: "投票が見つかりません。" },
      { status: 404 }
    );
  }

  const options = Array.isArray(voting.options)
    ? (voting.options as { id: string; label: string }[])
    : [];

  if (voting.status === VotingStatus.CLOSED) {
    return NextResponse.json(
      { error: "投票は締切済みです。" },
      { status: 400 }
    );
  }
  if (voting.deadlineAt && voting.deadlineAt.getTime() <= Date.now()) {
    const counts = await prisma.votingVote.groupBy({
      by: ["choiceId"],
      where: { votingId },
      _count: { _all: true },
    });
    const countMap: Record<string, number> = {};
    counts.forEach((item) => {
      countMap[item.choiceId] = item._count._all;
    });
    const { results, total } = buildResultsFromCounts(options, countMap);
    await prisma.voting.update({
      where: { id: votingId },
      data: {
        status: VotingStatus.CLOSED,
        results,
        totalVotes: total,
      },
    });
    return NextResponse.json(
      { error: "投票は締切済みです。" },
      { status: 400 }
    );
  }

  const payload = (await request.json().catch(() => ({}))) as VotePayload;
  const choiceId =
    typeof payload.choiceId === "string" ? payload.choiceId.trim() : "";
  if (!choiceId) {
    return NextResponse.json(
      { error: "投票先を選択してください。" },
      { status: 400 }
    );
  }
  const optionIds = new Set(options.map((option) => option.id));
  if (!optionIds.has(choiceId)) {
    return NextResponse.json(
      { error: "投票先が見つかりません。" },
      { status: 400 }
    );
  }

  let voteHash: string;
  try {
    voteHash = buildVoteHash(votingId, session.memberId);
  } catch (error) {
    captureApiException(error, sentryContext);
    return NextResponse.json(
      { error: "投票処理に失敗しました。" },
      { status: 500 }
    );
  }

  try {
    await prisma.votingVote.create({
      data: {
        votingId,
        choiceId,
        voteHash,
      },
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return NextResponse.json(
        { error: "すでに投票済みです。" },
        { status: 400 }
      );
    }
    captureApiException(error, sentryContext, { choiceId });
    return NextResponse.json(
      { error: "投票処理に失敗しました。" },
      { status: 500 }
    );
  }

  try {
    const counts = await prisma.votingVote.groupBy({
      by: ["choiceId"],
      where: { votingId },
      _count: { _all: true },
    });
    const countMap: Record<string, number> = {};
    counts.forEach((item) => {
      countMap[item.choiceId] = item._count._all;
    });
    const { results, total } = buildResultsFromCounts(options, countMap);
    await prisma.voting.update({
      where: { id: votingId },
      data: {
        results,
        totalVotes: total,
      },
    });

    revalidatePath("/voting");
    revalidatePath(`/voting/${votingId}`);

    return NextResponse.json({ success: true });
  } catch (error) {
    captureApiException(error, sentryContext, { choiceId });
    return NextResponse.json(
      { error: "投票結果の更新に失敗しました。" },
      { status: 500 }
    );
  }
}
