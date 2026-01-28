import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionFromCookies } from "@/lib/session";
import { TodoStatus } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { assertWriteRequestSecurity } from "@/lib/security";

type UpdateStatusRequest = {
  status: TodoStatus;
};

const VALID_STATUSES: TodoStatus[] = ["TODO", "IN_PROGRESS", "DONE"];

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ todoId: string }> }
) {
  const session = await getSessionFromCookies();
  const guard = assertWriteRequestSecurity(request, {
    memberId: session?.memberId,
  });
  if (guard) return guard;
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { todoId: todoIdString } = await params;
  const todoId = Number(todoIdString);
  if (!Number.isInteger(todoId) || todoId <= 0) {
    return NextResponse.json({ error: "Invalid todo id" }, { status: 400 });
  }

  const body = ((await request.json().catch(() => ({}))) ??
    {}) as UpdateStatusRequest;

  if (!VALID_STATUSES.includes(body.status)) {
    return NextResponse.json(
      { error: "ステータスはTODO、IN_PROGRESS、DONEのいずれかを指定してください。" },
      { status: 400 }
    );
  }

  const todo = await prisma.todoItem.findFirst({
    where: { id: todoId, groupId: session.groupId },
  });

  if (!todo) {
    return NextResponse.json(
      { error: "ToDoが見つかりません。" },
      { status: 404 }
    );
  }

  const updatedTodo = await prisma.todoItem.update({
    where: { id: todo.id },
    data: { status: body.status },
  });

  revalidatePath("/todo");

  return NextResponse.json({ success: true, todo: updatedTodo });
}
