import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionFromCookies } from "@/lib/session";
import { TodoStatus } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { upsertSearchIndex } from "@/lib/search-index";
import { assertWriteRequestSecurity } from "@/lib/security";

type CreateTodoRequest = {
  title: string;
  body?: string | null;
  assignedToId?: number | null;
};

export async function POST(request: Request) {
  const session = await getSessionFromCookies();
  const guard = assertWriteRequestSecurity(request, {
    memberId: session?.memberId,
  });
  if (guard) return guard;
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = ((await request.json().catch(() => ({}))) ??
    {}) as CreateTodoRequest;

  if (!body.title || typeof body.title !== "string" || !body.title.trim()) {
    return NextResponse.json(
      { error: "タイトルを入力してください。" },
      { status: 400 }
    );
  }

  // Validate assignedToId if provided
  if (body.assignedToId) {
    const member = await prisma.member.findFirst({
      where: { id: body.assignedToId, groupId: session.groupId },
    });
    if (!member) {
      return NextResponse.json(
        { error: "指定された担当者が見つかりません。" },
        { status: 400 }
      );
    }
  }

  const newTodo = await prisma.todoItem.create({
    data: {
      groupId: session.groupId,
      createdByMemberId: session.memberId,
      title: body.title.trim(),
      body: body.body?.trim() || null,
      assignedMemberId: body.assignedToId || null,
      status: TodoStatus.TODO,
      sourceThreadId: null,
    },
    include: {
      createdBy: { select: { id: true, displayName: true } },
      assignedTo: { select: { id: true, displayName: true } },
    },
  });

  revalidatePath("/todo");

  await upsertSearchIndex({
    groupId: session.groupId,
    entityType: "TODO",
    entityId: newTodo.id,
    title: newTodo.title,
    content: newTodo.body,
    urlPath: `/todo?focus=${newTodo.id}`,
    threadId: newTodo.sourceThreadId,
    occurredAt: newTodo.dueDate ?? newTodo.createdAt,
  });

  return NextResponse.json({ success: true, todo: newTodo });
}
