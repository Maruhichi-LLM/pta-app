import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionFromCookies } from "@/lib/session";
import { assertWriteRequestSecurity } from "@/lib/security";
import { ROLE_ADMIN } from "@/lib/roles";
import { revalidatePath } from "next/cache";

export async function POST(request: Request) {
  const session = await getSessionFromCookies();
  const guard = assertWriteRequestSecurity(request, {
    memberId: session?.memberId,
  });
  if (guard) return guard;
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const member = await prisma.member.findUnique({
    where: { id: session.memberId },
    select: { role: true, groupId: true },
  });
  if (!member || member.groupId !== session.groupId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (member.role !== ROLE_ADMIN) {
    return NextResponse.json(
      { error: "管理者のみが投稿できます。" },
      { status: 403 }
    );
  }

  const payload = await request.json().catch(() => null);
  const title =
    typeof payload?.title === "string" ? payload.title.trim() : "";
  const content =
    typeof payload?.content === "string" ? payload.content.trim() : "";
  if (!title) {
    return NextResponse.json(
      { error: "タイトルを入力してください。" },
      { status: 400 }
    );
  }
  if (!content) {
    return NextResponse.json(
      { error: "本文を入力してください。" },
      { status: 400 }
    );
  }

  const announcement = await prisma.groupAnnouncement.create({
    data: {
      groupId: session.groupId,
      title,
      content,
      createdByMemberId: session.memberId,
    },
  });

  revalidatePath("/home");
  revalidatePath("/announcements");

  return NextResponse.json({ id: announcement.id });
}
