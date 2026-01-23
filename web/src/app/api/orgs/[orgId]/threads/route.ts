import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { ThreadSourceType, ThreadStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSessionFromCookies } from "@/lib/session";
import { ensureFreeThread, findExistingThreadForSource } from "@/lib/chat";

const SOURCE_TYPE_LABELS: Record<ThreadSourceType, string> = {
  TODO: "ToDo",
  EVENT: "Event",
  ACCOUNTING: "Accounting",
  DOCUMENT: "Document",
  FREE: "FREE",
};

type ThreadPayload = {
  title?: string;
  sourceType?: ThreadSourceType;
  sourceId?: number | string | null;
};

async function requireOrgSession(orgIdParam: string) {
  const session = await getSessionFromCookies();
  if (!session) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  let orgId = Number(orgIdParam);
  if (!Number.isInteger(orgId) || orgId <= 0) {
    orgId = session.groupId;
  }
  if (session.groupId !== orgId) {
    return {
      error: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    };
  }
  return { session, orgId } as const;
}

export async function GET(
  _request: NextRequest,
  { params }: { params: { orgId: string } }
) {
  const context = await requireOrgSession(params.orgId);
  if ("error" in context) {
    return context.error;
  }
  const { orgId } = context;
  const threads = await prisma.chatThread.findMany({
    where: { groupId: orgId, status: ThreadStatus.OPEN },
    orderBy: { updatedAt: "desc" },
  });
  return NextResponse.json({ threads });
}

export async function POST(
  request: NextRequest,
  { params }: { params: { orgId: string } }
) {
  const context = await requireOrgSession(params.orgId);
  if ("error" in context) {
    return context.error;
  }
  const { orgId } = context;
  const payload = (await request.json().catch(() => ({}))) as ThreadPayload;
  const sourceType = payload.sourceType as ThreadSourceType | undefined;
  if (
    !sourceType ||
    !Object.values(ThreadSourceType).includes(sourceType)
  ) {
    return NextResponse.json({ error: "Invalid source type" }, { status: 400 });
  }
  const normalizedSourceType = sourceType as ThreadSourceType;
  let normalizedSourceId: number | null = null;
  if (normalizedSourceType !== ThreadSourceType.FREE) {
    normalizedSourceId = Number(payload.sourceId);
    if (!Number.isInteger(normalizedSourceId)) {
      return NextResponse.json(
        { error: "sourceId is required for this source type" },
        { status: 400 }
      );
    }
  }

  let thread = await findExistingThreadForSource(
    orgId,
    normalizedSourceType,
    normalizedSourceId
  );
  let derivedTitle: string | null = null;
  let createdThread = false;
  if (!thread) {
    derivedTitle = await resolveThreadTitle(
      normalizedSourceType,
      normalizedSourceId,
      orgId
    );
    if (derivedTitle === null) {
      return NextResponse.json({ error: "Source not found" }, { status: 404 });
    }
    const title =
      (payload.title?.trim() || derivedTitle || SOURCE_TYPE_LABELS[normalizedSourceType]) ??
      SOURCE_TYPE_LABELS[normalizedSourceType];
    if (normalizedSourceType === ThreadSourceType.FREE) {
      thread = await ensureFreeThread(orgId);
      if (!thread.title) {
        await prisma.chatThread.update({
          where: { id: thread.id },
          data: { title },
        });
        thread = await prisma.chatThread.findUnique({ where: { id: thread.id } });
      }
      createdThread = true;
    } else {
      thread = await prisma.chatThread.create({
        data: {
          groupId: orgId,
          title,
          sourceType: normalizedSourceType,
          sourceId: normalizedSourceId,
          status: ThreadStatus.OPEN,
        },
      });
      createdThread = true;
    }
  }

  if (
    normalizedSourceId !== null &&
    normalizedSourceType !== ThreadSourceType.FREE
  ) {
    await linkSourceRecordToThread(
      normalizedSourceType,
      normalizedSourceId,
      orgId,
      thread.id
    );
  }

  if (createdThread) {
    revalidatePath("/chat");
  }

  return NextResponse.json({ thread });
}

async function resolveThreadTitle(
  sourceType: ThreadSourceType,
  sourceId: number | null,
  groupId: number
) {
  if (sourceType === ThreadSourceType.FREE) {
    return "FREEスレッド";
  }
  if (!Number.isInteger(sourceId)) {
    return null;
  }
  switch (sourceType) {
    case ThreadSourceType.TODO: {
      const todo = await prisma.todoItem.findFirst({
        where: { id: sourceId!, groupId },
        select: { title: true },
      });
      return todo ? `ToDo: ${todo.title}` : null;
    }
    case ThreadSourceType.ACCOUNTING: {
      const ledger = await prisma.ledger.findFirst({
        where: { id: sourceId!, groupId },
        select: { title: true },
      });
      return ledger ? `Accounting: ${ledger.title}` : null;
    }
    case ThreadSourceType.DOCUMENT: {
      const document = await prisma.document.findFirst({
        where: { id: sourceId!, groupId },
        select: { title: true },
      });
      return document ? `Document: ${document.title}` : null;
    }
    case ThreadSourceType.EVENT: {
      const event = await prisma.event.findFirst({
        where: { id: sourceId!, groupId },
        select: { title: true },
      });
      return event ? `Event: ${event.title}` : null;
    }
    default:
      return null;
  }
}

async function linkSourceRecordToThread(
  sourceType: ThreadSourceType,
  sourceId: number,
  groupId: number,
  threadId: number
) {
  switch (sourceType) {
    case ThreadSourceType.TODO:
      await prisma.todoItem.updateMany({
        where: { id: sourceId, groupId },
        data: { sourceThreadId: threadId },
      });
      break;
    case ThreadSourceType.ACCOUNTING:
      await prisma.ledger.updateMany({
        where: { id: sourceId, groupId },
        data: { sourceThreadId: threadId },
      });
      break;
    case ThreadSourceType.DOCUMENT:
      await prisma.document.updateMany({
        where: { id: sourceId, groupId },
        data: { sourceThreadId: threadId },
      });
      break;
    default:
      break;
  }
}
