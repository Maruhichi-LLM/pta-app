import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionFromCookies } from "@/lib/session";
import { revalidatePath } from "next/cache";
import { ROLE_ADMIN } from "@/lib/roles";

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

export async function POST(request: Request) {
  const session = await getSessionFromCookies();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = await ensureAdmin(session.memberId);
  if (!admin) {
    return NextResponse.json({ error: "権限がありません。" }, { status: 403 });
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

  const event = await prisma.event.create({
    data: {
      groupId: admin.groupId,
      title,
      description: body.description?.trim(),
      location: body.location?.trim(),
      startsAt,
      endsAt,
    },
  });

  revalidatePath("/events");

  return NextResponse.json({ success: true, event });
}
