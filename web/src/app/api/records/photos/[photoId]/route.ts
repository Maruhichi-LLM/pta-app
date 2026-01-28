import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionFromCookies } from "@/lib/session";
import { isPlatformAdminEmail } from "@/lib/admin";
import fs from "node:fs/promises";
import { getRecordPhotoAbsolutePath } from "@/lib/record-storage";

async function loadRequester(memberId: number) {
  const member = await prisma.member.findUnique({
    where: { id: memberId },
    select: { email: true },
  });
  return member?.email ?? null;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ photoId: string }> }
) {
  const session = await getSessionFromCookies();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { photoId } = await params;
  const id = Number(photoId);
  if (!Number.isInteger(id)) {
    return NextResponse.json({ error: "Invalid photo id" }, { status: 400 });
  }

  const photo = await prisma.recordPhoto.findUnique({
    where: { id },
    include: {
      record: {
        select: { id: true, groupId: true },
      },
    },
  });

  if (!photo) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const email = await loadRequester(session.memberId);
  const isAdmin = isPlatformAdminEmail(email ?? null);
  if (!isAdmin && photo.record.groupId !== session.groupId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const absolutePath = getRecordPhotoAbsolutePath(
    photo.record.groupId,
    photo.recordId,
    photo.id
  );

  const { searchParams } = new URL(request.url);
  const download = searchParams.get("download");

  try {
    const data = await fs.readFile(absolutePath);
    return new NextResponse(data, {
      headers: {
        "Content-Type": photo.mimeType || "application/octet-stream",
        "Content-Disposition": `${
          download ? "attachment" : "inline"
        }; filename*=UTF-8''${encodeURIComponent(photo.fileName)}`,
      },
    });
  } catch {
    return NextResponse.json(
      { error: "ファイルを取得できませんでした。" },
      { status: 404 }
    );
  }
}
