import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionFromCookies } from "@/lib/session";
import { ensureModuleEnabled } from "@/lib/modules";
import { ensureFreeThread } from "@/lib/chat";
import {
  assertSameOrigin,
  CSRF_ERROR_MESSAGE,
  RATE_LIMIT_ERROR_MESSAGE,
  checkRateLimit,
  getRateLimitRule,
  buildRateLimitKey,
} from "@/lib/security";

async function getSessionOrForbidden() {
  const session = await getSessionFromCookies();
  if (!session) {
    return null;
  }
  await ensureModuleEnabled(session.groupId, "chat");
  return session;
}

export async function GET() {
  const session = await getSessionOrForbidden();
  if (!session) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const thread = await ensureFreeThread(session.groupId);
  const messages = await prisma.chatMessage.findMany({
    where: { threadId: thread.id },
    include: {
      author: {
        select: { id: true, displayName: true },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json({
    threadId: thread.id,
    messages: messages.map((message) => ({
      id: message.id,
      body: message.body,
      createdAt: message.createdAt,
      author: message.author,
    })),
  });
}

export async function POST(req: NextRequest) {
  const csrf = assertSameOrigin(req);
  if (!csrf.ok) {
    return NextResponse.json(
      { error: CSRF_ERROR_MESSAGE },
      { status: 403 }
    );
  }

  const session = await getSessionOrForbidden();
  if (!session) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { limit, windowSec } = getRateLimitRule("write");
  const rate = checkRateLimit({
    key: buildRateLimitKey({
      scope: "write",
      request: req,
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

  const payload = (await req.json().catch(() => ({}))) as { body?: string };
  const body = payload.body?.trim();
  if (!body) {
    return NextResponse.json(
      { error: "メッセージを入力してください。" },
      { status: 400 }
    );
  }
  if (body.length > 2000) {
    return NextResponse.json(
      { error: "メッセージが長すぎます。(2000文字以内)" },
      { status: 400 }
    );
  }

  const thread = await ensureFreeThread(session.groupId);
  await prisma.chatMessage.create({
    data: {
      threadId: thread.id,
      groupId: session.groupId,
      authorId: session.memberId,
      body,
    },
  });

  return NextResponse.json({ ok: true });
}
