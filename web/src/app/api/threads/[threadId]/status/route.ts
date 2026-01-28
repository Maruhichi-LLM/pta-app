import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionFromCookies } from "@/lib/session";
import { ThreadStatus } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { assertWriteRequestSecurity } from "@/lib/security";

type UpdateStatusRequest = {
  status: "OPEN" | "CLOSED";
};

export async function PATCH(
  request: Request,
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

  const { threadId: threadIdString } = await params;
  const threadId = Number(threadIdString);
  if (!Number.isInteger(threadId) || threadId <= 0) {
    return NextResponse.json({ error: "Invalid thread id" }, { status: 400 });
  }

  const body = ((await request.json().catch(() => ({}))) ??
    {}) as UpdateStatusRequest;

  if (body.status !== "OPEN" && body.status !== "CLOSED") {
    return NextResponse.json(
      { error: "ステータスはOPENまたはCLOSEDを指定してください。" },
      { status: 400 }
    );
  }

  const thread = await prisma.chatThread.findFirst({
    where: { id: threadId, groupId: session.groupId },
  });

  if (!thread) {
    return NextResponse.json(
      { error: "スレッドが見つかりません。" },
      { status: 404 }
    );
  }

  const updatedThread = await prisma.chatThread.update({
    where: { id: thread.id },
    data: { status: body.status as ThreadStatus },
  });

  revalidatePath("/chat");
  revalidatePath(`/threads/${thread.id}`);

  return NextResponse.json({ success: true, thread: updatedThread });
}
