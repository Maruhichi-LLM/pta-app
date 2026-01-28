import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionFromCookies } from "@/lib/session";
import { revalidatePath } from "next/cache";
import { assertWriteRequestSecurity } from "@/lib/security";

type AttendanceRequest = {
  status?: "YES" | "NO" | "MAYBE";
  comment?: string;
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
  const { id } = await params;

  const eventId = Number(id);
  if (!Number.isInteger(eventId)) {
    return NextResponse.json({ error: "Invalid event id" }, { status: 400 });
  }

  const body = ((await request.json().catch(() => ({}))) ??
    {}) as AttendanceRequest;
  const status = body.status;

  if (status !== "YES" && status !== "NO" && status !== "MAYBE") {
    return NextResponse.json(
      { error: "出欠ステータスを選択してください。" },
      { status: 400 }
    );
  }

  const event = await prisma.event.findFirst({
    where: { id: eventId, groupId: session.groupId },
  });

  if (!event) {
    return NextResponse.json({ error: "イベントが見つかりません。" }, { status: 404 });
  }

  const attendance = await prisma.attendance.upsert({
    where: {
      eventId_memberId: {
        eventId,
        memberId: session.memberId,
      },
    },
    update: {
      status,
      comment: body.comment?.trim() || null,
      respondedAt: new Date(),
    },
    create: {
      eventId,
      memberId: session.memberId,
      status,
      comment: body.comment?.trim(),
    },
    include: {
      member: true,
    },
  });

  revalidatePath("/events");

  return NextResponse.json({ success: true, attendance });
}
