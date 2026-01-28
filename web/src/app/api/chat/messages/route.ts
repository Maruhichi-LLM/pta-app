import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionFromCookies } from "@/lib/session";
import { ensureModuleEnabled } from "@/lib/modules";
import { ensureFreeThread } from "@/lib/chat";
import { assertWriteRequestSecurity } from "@/lib/security";

async function getSessionOrForbidden(
  sessionOverride?: Awaited<ReturnType<typeof getSessionFromCookies>> | null
) {
  const session = sessionOverride ?? (await getSessionFromCookies());
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
  const sessionSeed = await getSessionFromCookies();
  const guard = assertWriteRequestSecurity(req, {
    memberId: sessionSeed?.memberId,
  });
  if (guard) return guard;
  const session = await getSessionOrForbidden(sessionSeed);
  if (!session) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
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
