import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionFromCookies } from "@/lib/session";
import { isPlatformAdminEmail } from "@/lib/admin";
import { DocumentCategory } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { saveUploadedDocumentFile } from "@/lib/document-storage";

const DOCUMENT_CATEGORIES = Object.values(DocumentCategory);

async function loadRequester(sessionGroupId: number, memberId: number) {
  const member = await prisma.member.findUnique({
    where: { id: memberId },
    select: { email: true, groupId: true },
  });
  const isAdmin = isPlatformAdminEmail(member?.email ?? null);
  return {
    isAdmin,
    memberGroupId: member?.groupId ?? sessionGroupId,
    email: member?.email ?? null,
  };
}

function parseCategory(value: FormDataEntryValue | null) {
  if (!value) return null;
  const upper = String(value).toUpperCase();
  return DOCUMENT_CATEGORIES.includes(upper as DocumentCategory)
    ? (upper as DocumentCategory)
    : null;
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
  const categoryParam = searchParams.get("category");
  const filter: Record<string, unknown> = {};
  if (!Number.isNaN(fiscalYear) && fiscalYear > 0) {
    filter.fiscalYear = fiscalYear;
  }
  if (categoryParam) {
    const category = parseCategory(categoryParam);
    if (category) {
      filter.category = category;
    }
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

  const documents = await prisma.document.findMany({
    where: filter,
    orderBy: { updatedAt: "desc" },
    include: {
      group: { select: { id: true, name: true } },
      versions: {
        orderBy: { versionNumber: "desc" },
        take: 1,
        include: { createdBy: { select: { id: true, displayName: true } } },
      },
    },
  });

  return NextResponse.json({
    documents: documents.map((doc) => ({
      id: doc.id,
      title: doc.title,
      category: doc.category,
      fiscalYear: doc.fiscalYear,
      group: doc.group,
      updatedAt: doc.updatedAt,
      latestVersion: doc.versions[0]
        ? {
            id: doc.versions[0].id,
            versionNumber: doc.versions[0].versionNumber,
            createdAt: doc.versions[0].createdAt,
            createdBy: doc.versions[0].createdBy,
            originalFilename: doc.versions[0].originalFilename,
          }
        : null,
    })),
  });
}

export async function POST(request: Request) {
  const session = await getSessionFromCookies();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { isAdmin, memberGroupId } = await loadRequester(
    session.groupId,
    session.memberId
  );
  const formData = await request.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json(
      { error: "ファイルを選択してください。" },
      { status: 400 }
    );
  }
  const title = (formData.get("title") as string | null)?.trim();
  const fiscalYearValue = Number(formData.get("fiscalYear"));
  const category = parseCategory(formData.get("category"));
  const eventIdValue = formData.get("eventId");
  const targetGroupId = isAdmin
    ? Number(formData.get("groupId")) || memberGroupId
    : memberGroupId;

  if (!title) {
    return NextResponse.json(
      { error: "タイトルを入力してください。" },
      { status: 400 }
    );
  }
  if (!Number.isInteger(fiscalYearValue)) {
    return NextResponse.json(
      { error: "年度を正しく入力してください。" },
      { status: 400 }
    );
  }
  if (!category) {
    return NextResponse.json(
      { error: "種別を選択してください。" },
      { status: 400 }
    );
  }
  const eventId = eventIdValue ? Number(eventIdValue) : null;
  if (eventId && !Number.isInteger(eventId)) {
    return NextResponse.json(
      { error: "イベントIDを正しく入力してください。" },
      { status: 400 }
    );
  }
  if (eventId) {
    const event = await prisma.event.findUnique({
      where: { id: eventId },
      select: { groupId: true },
    });
    if (!event || event.groupId !== targetGroupId) {
      return NextResponse.json(
        { error: "指定されたイベントは存在しません。" },
        { status: 400 }
      );
    }
  }

  try {
    const document = await prisma.document.create({
      data: {
        groupId: targetGroupId,
        title,
        category,
        fiscalYear: fiscalYearValue,
        eventId,
        createdByMemberId: session.memberId,
      },
    });
    const version = await prisma.documentVersion.create({
      data: {
        documentId: document.id,
        versionNumber: 1,
        originalFilename: file.name,
        storedPath: "",
        mimeType: file.type || "application/octet-stream",
        sizeBytes: file.size,
        createdByMemberId: session.memberId,
      },
    });
    const storedPath = await saveUploadedDocumentFile(
      document.groupId,
      document.id,
      version.id,
      file
    );
    await prisma.documentVersion.update({
      where: { id: version.id },
      data: { storedPath },
    });
    await prisma.document.update({
      where: { id: document.id },
      data: { updatedAt: new Date() },
    });
    revalidatePath("/documents");
    revalidatePath(`/documents/${document.id}`);
    return NextResponse.json({ success: true, documentId: document.id });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "保存に失敗しました。" },
      { status: 400 }
    );
  }
}
