import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { VotingStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSessionFromCookies } from "@/lib/session";
import { ensureModuleEnabled } from "@/lib/modules";
import {
  assertSameOrigin,
  CSRF_ERROR_MESSAGE,
  RATE_LIMIT_ERROR_MESSAGE,
  checkRateLimit,
  getRateLimitRule,
  buildRateLimitKey,
} from "@/lib/security";
import {
  normalizeVotingOptions,
  VOTING_LIMITS,
  DEFAULT_VOTING_OPTIONS,
} from "@/lib/voting";

type CreateVotingRequest = {
  title?: string;
  description?: string | null;
  options?: unknown;
  deadlineAt?: string | null;
  sourceThreadId?: number | string | null;
  sourceChatMessageId?: number | string | null;
};

export async function GET() {
  const session = await getSessionFromCookies();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  await ensureModuleEnabled(session.groupId, "voting");

  const votings = await prisma.voting.findMany({
    where: { groupId: session.groupId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      title: true,
      description: true,
      status: true,
      deadlineAt: true,
      totalVotes: true,
      threadId: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return NextResponse.json({ votings });
}

export async function POST(request: Request) {
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

  const payload = (await request.json().catch(() => ({}))) as CreateVotingRequest;
  const title = typeof payload.title === "string" ? payload.title.trim() : "";
  if (!title) {
    return NextResponse.json(
      { error: "タイトルを入力してください。" },
      { status: 400 }
    );
  }
  if (title.length > VOTING_LIMITS.titleMax) {
    return NextResponse.json(
      { error: `タイトルは${VOTING_LIMITS.titleMax}文字以内で入力してください。` },
      { status: 400 }
    );
  }

  const descriptionRaw =
    typeof payload.description === "string" ? payload.description.trim() : "";
  if (descriptionRaw.length > VOTING_LIMITS.descriptionMax) {
    return NextResponse.json(
      {
        error: `説明は${VOTING_LIMITS.descriptionMax}文字以内で入力してください。`,
      },
      { status: 400 }
    );
  }

  const normalizedOptions = normalizeVotingOptions(payload.options);
  if ("error" in normalizedOptions) {
    return NextResponse.json(
      { error: normalizedOptions.error },
      { status: 400 }
    );
  }
  const options = normalizedOptions.options ?? DEFAULT_VOTING_OPTIONS;

  let deadlineAt: Date | null = null;
  if (payload.deadlineAt) {
    const parsed = new Date(payload.deadlineAt);
    if (Number.isNaN(parsed.getTime())) {
      return NextResponse.json(
        { error: "締切日時を正しく入力してください。" },
        { status: 400 }
      );
    }
    deadlineAt = parsed;
  }

  const sourceThreadIdRaw = payload.sourceThreadId;
  const sourceThreadId = Number(sourceThreadIdRaw);
  const resolvedSourceThreadId =
    Number.isInteger(sourceThreadId) && sourceThreadId > 0
      ? sourceThreadId
      : null;

  const sourceChatMessageIdRaw = payload.sourceChatMessageId;
  const sourceChatMessageId = Number(sourceChatMessageIdRaw);
  const resolvedSourceChatMessageId =
    Number.isInteger(sourceChatMessageId) && sourceChatMessageId > 0
      ? sourceChatMessageId
      : null;

  let sourceThread = null;
  if (resolvedSourceThreadId) {
    await ensureModuleEnabled(session.groupId, "chat");
    sourceThread = await prisma.chatThread.findFirst({
      where: { id: resolvedSourceThreadId, groupId: session.groupId },
      select: { id: true },
    });
    if (!sourceThread) {
      return NextResponse.json(
        { error: "元のチャットスレッドが見つかりません。" },
        { status: 404 }
      );
    }
  }

  let sourceMessage = null;
  if (resolvedSourceChatMessageId) {
    sourceMessage = await prisma.chatMessage.findFirst({
      where: { id: resolvedSourceChatMessageId, groupId: session.groupId },
      select: { id: true, threadId: true },
    });
    if (!sourceMessage) {
      return NextResponse.json(
        { error: "元のチャットメッセージが見つかりません。" },
        { status: 404 }
      );
    }
  }

  if (sourceThread && sourceMessage && sourceMessage.threadId !== sourceThread.id) {
    return NextResponse.json(
      { error: "元のチャット情報が一致しません。" },
      { status: 400 }
    );
  }

  const [voting, cardMessage] = await prisma.$transaction(async (tx) => {
    const createdVoting = await tx.voting.create({
      data: {
        groupId: session.groupId,
        createdByMemberId: session.memberId,
        title,
        description: descriptionRaw || null,
        options,
        deadlineAt,
        status: VotingStatus.OPEN,
        sourceThreadId: sourceThread?.id ?? null,
        sourceChatMessageId: sourceMessage?.id ?? null,
      },
    });

    let createdCardMessage = null;
    if (sourceThread) {
      createdCardMessage = await tx.chatMessage.create({
        data: {
          threadId: sourceThread.id,
          groupId: session.groupId,
          authorId: session.memberId,
          body: `【投票】${title}`,
          votingId: createdVoting.id,
        },
      });
    }

    return [createdVoting, createdCardMessage] as const;
  });

  revalidatePath("/voting");
  if (sourceThread) {
    revalidatePath(`/threads/${sourceThread.id}`);
  }

  return NextResponse.json({ voting, cardMessageId: cardMessage?.id ?? null });
}
