import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getSessionFromCookies } from "@/lib/session";
import { upsertSearchIndex } from "@/lib/search-index";
import { assertWriteRequestSecurity } from "@/lib/security";
import { ThreadSourceType } from "@prisma/client";

function parseThreadId(raw: string) {
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) {
    return null;
  }
  return id;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ threadId: string }> }
) {
  const session = await getSessionFromCookies();
  const guard = assertWriteRequestSecurity(request, {
    memberId: session?.memberId,
  });
  if (guard) return guard;
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const resolvedParams = await params;
  const threadId = parseThreadId(resolvedParams.threadId);
  if (!threadId) {
    return NextResponse.json({ error: "Invalid thread id" }, { status: 400 });
  }
  const payload = (await request.json().catch(() => ({}))) as {
    content?: string;
  };
  const content = payload.content?.trim();
  if (!content) {
    return NextResponse.json(
      { error: "メッセージを入力してください。" },
      { status: 400 }
    );
  }
  if (content.length > 2000) {
    return NextResponse.json(
      { error: "メッセージが長すぎます。(2000文字以内)" },
      { status: 400 }
    );
  }
  const thread = await prisma.chatThread.findFirst({
    where: { id: threadId, groupId: session.groupId },
    select: { id: true, title: true, sourceType: true, sourceId: true },
  });
  if (!thread) {
    return NextResponse.json({ error: "Thread not found" }, { status: 404 });
  }

  const message = await prisma.$transaction(async (tx) => {
    const created = await tx.chatMessage.create({
      data: {
        threadId: thread.id,
        groupId: session.groupId,
        authorId: session.memberId,
        body: content,
      },
    });
    await tx.chatThread.update({
      where: { id: thread.id },
      data: { updatedAt: new Date() },
    });
    return created;
  });

  revalidatePath(`/threads/${thread.id}`);
  revalidatePath("/chat");

  await upsertSearchIndex({
    groupId: session.groupId,
    entityType: "CHAT_MESSAGE",
    entityId: message.id,
    title: thread.title || "Chat",
    content: message.body,
    urlPath: `/threads/${thread.id}`,
    threadId: thread.id,
    eventId:
      thread.sourceType === ThreadSourceType.EVENT ? thread.sourceId ?? null : null,
    occurredAt: message.createdAt,
  });

  return NextResponse.json({ messageId: message.id });
}
