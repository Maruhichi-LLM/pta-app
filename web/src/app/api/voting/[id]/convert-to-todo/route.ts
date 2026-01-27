import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { TodoStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSessionFromCookies } from "@/lib/session";
import { ensureModuleEnabled } from "@/lib/modules";
import { ROLE_ADMIN } from "@/lib/roles";
import {
  assertSameOrigin,
  CSRF_ERROR_MESSAGE,
  RATE_LIMIT_ERROR_MESSAGE,
  checkRateLimit,
  getRateLimitRule,
  buildRateLimitKey,
} from "@/lib/security";
import { buildResultsFromCounts } from "@/lib/voting";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const csrf = assertSameOrigin(request);
  if (!csrf.ok) {
    return NextResponse.json(
      { error: CSRF_ERROR_MESSAGE },
      { status: 403 }
    );
  }

  const session = await getSessionFromCookies();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  await ensureModuleEnabled(session.groupId, "voting");
  await ensureModuleEnabled(session.groupId, "todo");

  const { limit, windowSec } = getRateLimitRule("write");
  const rate = checkRateLimit({
    key: buildRateLimitKey({
      scope: "write",
      request,
      memberId: session.memberId,
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

  const { id } = await params;
  const votingId = Number(id);
  if (!Number.isInteger(votingId)) {
    return NextResponse.json(
      { error: "投票が見つかりません。" },
      { status: 404 }
    );
  }

  const [voting, member, comments] = await Promise.all([
    prisma.voting.findFirst({
      where: { id: votingId, groupId: session.groupId },
      select: {
        id: true,
        title: true,
        options: true,
        createdByMemberId: true,
        sourceThreadId: true,
        threadId: true,
      },
    }),
    prisma.member.findUnique({
      where: { id: session.memberId },
      select: { role: true },
    }),
    prisma.votingComment.findMany({
      where: { votingId },
      orderBy: { createdAt: "asc" },
      select: { body: true },
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
      { error: "ToDo化の権限がありません。" },
      { status: 403 }
    );
  }

  const existing = await prisma.todoItem.findFirst({
    where: { sourceVotingId: votingId, groupId: session.groupId },
    select: { id: true },
  });
  if (existing) {
    return NextResponse.json({
      todoId: existing.id,
      url: `/todo?focus=${existing.id}`,
      status: "exists" as const,
    });
  }

  const options = Array.isArray(voting.options)
    ? (voting.options as { id: string; label: string }[])
    : [];
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

  let majorityLabel = "最多票";
  if (options.length > 0) {
    const sorted = [...options].sort(
      (a, b) => (results[b.id] ?? 0) - (results[a.id] ?? 0)
    );
    const topLabel = sorted[0]?.label;
    if (topLabel) {
      majorityLabel = topLabel.includes("賛成")
        ? "賛成多数"
        : `${topLabel}多数`;
    }
  }

  const threadId = voting.sourceThreadId ?? voting.threadId;
  const bodyLines = [
    `投票タイトル: ${voting.title}`,
    "結果（票数）:",
    ...options.map(
      (option) => `・${option.label}: ${results[option.id] ?? 0}`
    ),
    `（合計: ${total}）`,
    "",
    "匿名コメント:",
    ...(comments.length > 0
      ? comments.map((comment) => `- ${comment.body}`)
      : ["（コメントなし）"]),
    "",
    `投票リンク: /voting/${voting.id}`,
  ];
  if (threadId) {
    bodyLines.push(`元のチャット: /threads/${threadId}`);
  }

  const todo = await prisma.todoItem.create({
    data: {
      groupId: session.groupId,
      createdByMemberId: session.memberId,
      title: `【投票結果】${voting.title}（${majorityLabel}）`,
      body: bodyLines.join("\n"),
      status: TodoStatus.TODO,
      sourceVotingId: voting.id,
      sourceThreadId: threadId ?? null,
    },
  });

  revalidatePath("/todo");
  if (threadId) {
    revalidatePath(`/threads/${threadId}`);
  }

  return NextResponse.json({
    status: "created" as const,
    todoId: todo.id,
    url: `/todo?focus=${todo.id}`,
  });
}
