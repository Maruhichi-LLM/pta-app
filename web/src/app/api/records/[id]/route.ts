import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionFromCookies } from "@/lib/session";
import { isPlatformAdminEmail } from "@/lib/admin";
import { revalidatePath } from "next/cache";
import { ROLE_ADMIN } from "@/lib/roles";
import { getRecordPhotoAbsolutePath, getRecordStorageBaseDir } from "@/lib/record-storage";
import fs from "node:fs/promises";
import path from "node:path";
import {
  assertSameOrigin,
  CSRF_ERROR_MESSAGE,
  RATE_LIMIT_ERROR_MESSAGE,
  checkRateLimit,
  getRateLimitRule,
  buildRateLimitKey,
} from "@/lib/security";

async function loadRequester(memberId: number) {
  const member = await prisma.member.findUnique({
    where: { id: memberId },
    select: { email: true, role: true, groupId: true },
  });
  return {
    email: member?.email ?? null,
    role: member?.role ?? null,
    groupId: member?.groupId ?? null,
  };
}

async function loadRecord(recordId: number) {
  return prisma.record.findUnique({
    where: { id: recordId },
    include: {
      group: { select: { id: true, name: true } },
      event: { select: { id: true, title: true } },
      createdBy: { select: { id: true, displayName: true } },
      photos: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          url: true,
          fileName: true,
          mimeType: true,
          sizeBytes: true,
          createdAt: true,
        },
      },
    },
  });
}

function canAccessRecord(recordGroupId: number, sessionGroupId: number, email: string | null) {
  if (isPlatformAdminEmail(email ?? null)) {
    return true;
  }
  return recordGroupId === sessionGroupId;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSessionFromCookies();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const recordId = Number(id);
  if (!Number.isInteger(recordId)) {
    return NextResponse.json({ error: "Invalid record id" }, { status: 400 });
  }

  const record = await loadRecord(recordId);
  if (!record) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const requester = await loadRequester(session.memberId);
  const allowed = canAccessRecord(
    record.groupId,
    session.groupId,
    requester.email
  );
  if (!allowed) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return NextResponse.json({ record });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const csrf = assertSameOrigin(request);
  if (!csrf.ok) {
    return NextResponse.json({ error: CSRF_ERROR_MESSAGE }, { status: 403 });
  }

  const session = await getSessionFromCookies();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { limit, windowSec } = getRateLimitRule("write");
  const rate = checkRateLimit({
    key: buildRateLimitKey({
      scope: "write",
      request,
      memberId: session.memberId,
    }),
    limit,
    windowSec,
  });
  if (!rate.ok) {
    return NextResponse.json(
      { error: RATE_LIMIT_ERROR_MESSAGE },
      {
        status: 429,
        headers: rate.retryAfterSec
          ? { "Retry-After": String(rate.retryAfterSec) }
          : undefined,
      }
    );
  }

  const { id } = await params;
  const recordId = Number(id);
  if (!Number.isInteger(recordId)) {
    return NextResponse.json({ error: "Invalid record id" }, { status: 400 });
  }

  const record = await prisma.record.findUnique({
    where: { id: recordId },
    include: {
      photos: true,
    },
  });
  if (!record) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const requester = await loadRequester(session.memberId);
  const isPlatformAdmin = isPlatformAdminEmail(requester.email ?? null);
  const isGroupAdmin =
    requester.role === ROLE_ADMIN && requester.groupId === session.groupId;
  const isOwner = record.createdByMemberId === session.memberId;

  if (!isPlatformAdmin && !isGroupAdmin && !isOwner) {
    return NextResponse.json(
      { error: "削除できるのは作成者または管理者のみです。" },
      { status: 403 }
    );
  }

  try {
    for (const photo of record.photos) {
      const filePath = getRecordPhotoAbsolutePath(
        record.groupId,
        record.id,
        photo.id
      );
      try {
        await fs.unlink(filePath);
      } catch {
        // ファイルが既に存在しない場合はスキップ
      }
    }

    const recordDir = path.join(
      getRecordStorageBaseDir(),
      String(record.groupId),
      String(record.id)
    );
    try {
      await fs.rmdir(recordDir, { recursive: true });
    } catch {
      // ディレクトリ削除に失敗してもDBは削除
    }

    await prisma.recordPhoto.deleteMany({ where: { recordId } });
    await prisma.record.delete({ where: { id: recordId } });

    revalidatePath("/records");
    revalidatePath(`/records/${recordId}`);
    if (record.eventId) {
      revalidatePath(`/events/${record.eventId}`);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "削除に失敗しました。" },
      { status: 400 }
    );
  }
}
