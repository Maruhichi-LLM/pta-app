import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionFromCookies } from "@/lib/session";
import { revalidatePath } from "next/cache";
import { ROLE_ADMIN } from "@/lib/roles";
import { upsertSearchIndex } from "@/lib/search-index";
import { assertWriteRequestSecurity } from "@/lib/security";

type EventPayload = {
  title?: string;
  description?: string;
  location?: string;
  startsAt?: string;
  endsAt?: string;
};

async function ensureAdmin(memberId: number) {
  const member = await prisma.member.findUnique({ where: { id: memberId } });
  if (!member || member.role !== ROLE_ADMIN) {
    return null;
  }
  return member;
}

function parseDate(value?: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (isNaN(date.getTime())) {
    return null;
  }
  return date;
}

export async function PATCH(
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

  const admin = await ensureAdmin(session.memberId);
  if (!admin) {
    return NextResponse.json({ error: "権限がありません。" }, { status: 403 });
  }

  const eventId = Number(id);
  if (!Number.isInteger(eventId)) {
    return NextResponse.json({ error: "Invalid event id" }, { status: 400 });
  }

  const body = ((await request.json().catch(() => ({}))) ??
    {}) as EventPayload;

  const title = body.title?.trim();
  const startsAt = parseDate(body.startsAt);
  const endsAt = parseDate(body.endsAt);

  if (!title || !startsAt) {
    return NextResponse.json(
      { error: "タイトルと開始日時を入力してください。" },
      { status: 400 }
    );
  }

  if (endsAt && endsAt < startsAt) {
    return NextResponse.json(
      { error: "終了日時は開始日時以降を指定してください。" },
      { status: 400 }
    );
  }

  const existing = await prisma.event.findFirst({
    where: { id: eventId, groupId: admin.groupId },
  });
  if (!existing) {
    return NextResponse.json({ error: "イベントが見つかりません。" }, { status: 404 });
  }

  const event = await prisma.event.update({
    where: { id: eventId },
    data: {
      title,
      description: body.description?.trim(),
      location: body.location?.trim(),
      startsAt,
      endsAt,
    },
  });

  revalidatePath("/events");

  await upsertSearchIndex({
    groupId: admin.groupId,
    entityType: "EVENT",
    entityId: event.id,
    title: event.title,
    content: [event.description, event.location].filter(Boolean).join(" "),
    urlPath: `/events/${event.id}`,
    eventId: event.id,
    occurredAt: event.startsAt,
  });

  return NextResponse.json({ success: true, event });
}
