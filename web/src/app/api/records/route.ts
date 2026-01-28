import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionFromCookies } from "@/lib/session";
import { isPlatformAdminEmail } from "@/lib/admin";
import { RecordSourceType } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { getFiscalYear, resolveFiscalYearStartMonth } from "@/lib/fiscal-year";
import {
  getRecordPhotoAbsolutePath,
  getRecordStorageBaseDir,
  saveUploadedRecordPhoto,
} from "@/lib/record-storage";
import fs from "node:fs/promises";
import path from "node:path";
import { assertWriteRequestSecurity } from "@/lib/security";

const SOURCE_TYPES = Object.values(RecordSourceType);

function parseSourceType(value: FormDataEntryValue | null) {
  if (!value) return null;
  const upper = String(value).toUpperCase();
  return SOURCE_TYPES.includes(upper as RecordSourceType)
    ? (upper as RecordSourceType)
    : null;
}

async function loadRequester(sessionGroupId: number, memberId: number) {
  const member = await prisma.member.findUnique({
    where: { id: memberId },
    select: { email: true, groupId: true },
  });
  const isAdmin = isPlatformAdminEmail(member?.email ?? null);
  return {
    isAdmin,
    memberGroupId: member?.groupId ?? sessionGroupId,
  };
}

export async function GET(request: Request) {
  const session = await getSessionFromCookies();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { isAdmin, memberGroupId } = await loadRequester(
    session.groupId,
    session.memberId
  );

  const { searchParams } = new URL(request.url);
  const fiscalYear = Number(searchParams.get("fiscalYear"));
  const eventId = Number(searchParams.get("eventId"));

  const filter: Record<string, unknown> = {};
  if (!Number.isNaN(fiscalYear) && fiscalYear > 0) {
    filter.fiscalYear = fiscalYear;
  }
  if (!Number.isNaN(eventId) && eventId > 0) {
    filter.eventId = eventId;
  }

  if (!isAdmin) {
    filter.groupId = memberGroupId;
  } else {
    const groupIdValue = searchParams.get("groupId");
    if (groupIdValue) {
      const groupIdNumber = Number(groupIdValue);
      if (Number.isInteger(groupIdNumber)) {
        filter.groupId = groupIdNumber;
      }
    }
  }

  const records = await prisma.record.findMany({
    where: filter,
    orderBy: { recordDate: "desc" },
    include: {
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
        },
      },
    },
  });

  return NextResponse.json({
    records: records.map((record) => ({
      id: record.id,
      caption: record.caption,
      recordDate: record.recordDate,
      fiscalYear: record.fiscalYear,
      sourceType: record.sourceType,
      sourceId: record.sourceId,
      event: record.event,
      createdBy: record.createdBy,
      photos: record.photos,
    })),
  });
}

export async function POST(request: Request) {
  const session = await getSessionFromCookies();
  const guard = assertWriteRequestSecurity(request, {
    memberId: session?.memberId,
  });
  if (guard) return guard;
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { isAdmin, memberGroupId } = await loadRequester(
    session.groupId,
    session.memberId
  );

  const formData = await request.formData();
  const files = formData
    .getAll("photos")
    .filter((file): file is File => file instanceof File);
  if (files.length === 0) {
    return NextResponse.json(
      { error: "写真ファイルを選択してください。" },
      { status: 400 }
    );
  }

  const captionRaw = (formData.get("caption") as string | null) ?? "";
  const caption = captionRaw.replace(/\s+/g, " ").trim();
  if (caption && caption.length > 255) {
    return NextResponse.json(
      { error: "キャプションは255文字以内で入力してください。" },
      { status: 400 }
    );
  }

  const sourceType = parseSourceType(formData.get("sourceType"));
  if (!sourceType) {
    return NextResponse.json(
      { error: "記録元モジュールを選択してください。" },
      { status: 400 }
    );
  }

  const eventIdValue = formData.get("eventId");
  const parsedEventId = eventIdValue ? Number(eventIdValue) : null;
  if (parsedEventId && !Number.isInteger(parsedEventId)) {
    return NextResponse.json(
      { error: "イベントIDを正しく入力してください。" },
      { status: 400 }
    );
  }

  const sourceIdValue = formData.get("sourceId");
  const parsedSourceId = sourceIdValue ? Number(sourceIdValue) : null;
  if (parsedSourceId && !Number.isInteger(parsedSourceId)) {
    return NextResponse.json(
      { error: "元データIDを正しく入力してください。" },
      { status: 400 }
    );
  }

  const targetGroupId = isAdmin
    ? Number(formData.get("groupId")) || memberGroupId
    : memberGroupId;

  for (const file of files) {
    if (file.type && !file.type.startsWith("image/")) {
      return NextResponse.json(
        { error: "写真ファイルのみアップロードできます。" },
        { status: 400 }
      );
    }
  }

  if (parsedEventId) {
    const event = await prisma.event.findUnique({
      where: { id: parsedEventId },
      select: { groupId: true },
    });
    if (!event || event.groupId !== targetGroupId) {
      return NextResponse.json(
        { error: "指定されたイベントは存在しません。" },
        { status: 400 }
      );
    }
  }

  const recordDate = new Date();
  const fiscalYearStartMonth = await resolveFiscalYearStartMonth(targetGroupId);
  const fiscalYear = getFiscalYear(recordDate, fiscalYearStartMonth);

  let recordId: number | null = null;
  const savedPhotoIds: number[] = [];

  try {
    const record = await prisma.record.create({
      data: {
        groupId: targetGroupId,
        eventId: parsedEventId ?? null,
        sourceType,
        sourceId:
          parsedSourceId ?? (sourceType === "EVENT" ? parsedEventId : null),
        caption: caption || null,
        recordDate,
        fiscalYear,
        createdByMemberId: session.memberId,
      },
    });
    recordId = record.id;

    for (const file of files) {
      const photo = await prisma.recordPhoto.create({
        data: {
          recordId: record.id,
          fileName: file.name,
          mimeType: file.type || "application/octet-stream",
          sizeBytes: file.size,
          url: "",
        },
      });
      savedPhotoIds.push(photo.id);
      await saveUploadedRecordPhoto(targetGroupId, record.id, photo.id, file);
      await prisma.recordPhoto.update({
        where: { id: photo.id },
        data: { url: `/api/records/photos/${photo.id}` },
      });
    }

    revalidatePath("/records");
    revalidatePath(`/records/${record.id}`);
    if (parsedEventId) {
      revalidatePath(`/events/${parsedEventId}`);
    }

    return NextResponse.json({ success: true, recordId: record.id });
  } catch (error) {
    if (recordId) {
      for (const photoId of savedPhotoIds) {
        const filePath = getRecordPhotoAbsolutePath(
          targetGroupId,
          recordId,
          photoId
        );
        try {
          await fs.unlink(filePath);
        } catch {
          // ignore missing file
        }
      }
      const recordDir = path.join(
        getRecordStorageBaseDir(),
        String(targetGroupId),
        String(recordId)
      );
      try {
        await fs.rmdir(recordDir, { recursive: true });
      } catch {
        // ignore
      }
      await prisma.recordPhoto.deleteMany({
        where: { recordId },
      });
      await prisma.record.delete({
        where: { id: recordId },
      });
    } else if (savedPhotoIds.length > 0) {
      await prisma.recordPhoto.deleteMany({
        where: { id: { in: savedPhotoIds } },
      });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "保存に失敗しました。" },
      { status: 400 }
    );
  }
}
