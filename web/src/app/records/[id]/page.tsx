import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getSessionFromCookies } from "@/lib/session";
import { ensureModuleEnabled } from "@/lib/modules";
import { isPlatformAdminEmail } from "@/lib/admin";
import { RecordDeleteButton } from "@/components/record-delete-button";
import { ROLE_ADMIN } from "@/lib/roles";
import { RecordPhotoGallery } from "@/components/record-photo-gallery";

const SOURCE_LABELS: Record<string, string> = {
  CHAT: "Chat",
  TODO: "ToDo",
  EVENT: "Event",
};

type RecordDetailProps = {
  params: Promise<{ id: string }>;
};

export default async function RecordDetailPage({ params }: RecordDetailProps) {
  const session = await getSessionFromCookies();
  if (!session) {
    redirect("/join");
  }

  await ensureModuleEnabled(session.groupId, "record");

  const { id } = await params;
  const recordId = Number(id);
  if (!Number.isInteger(recordId)) {
    notFound();
  }

  const record = await prisma.record.findUnique({
    where: { id: recordId },
    include: {
      group: { select: { id: true, name: true } },
      event: { select: { id: true, title: true } },
      createdBy: { select: { id: true, displayName: true, role: true } },
      photos: {
        orderBy: { createdAt: "asc" },
        select: { id: true, url: true, fileName: true },
      },
    },
  });

  if (!record) {
    notFound();
  }

  const member = await prisma.member.findUnique({
    where: { id: session.memberId },
    select: { email: true, role: true },
  });

  const isPlatformAdmin = isPlatformAdminEmail(member?.email ?? null);
  if (!isPlatformAdmin && record.groupId !== session.groupId) {
    redirect("/home");
  }

  const isGroupAdmin = member?.role === ROLE_ADMIN;
  const canDelete =
    isPlatformAdmin || isGroupAdmin || record.createdByMemberId === session.memberId;

  return (
    <div className="min-h-screen py-10">
      <div className="page-shell space-y-8">
        <div className="flex flex-col gap-3">
          <Link href="/records" className="text-sm text-sky-600 underline">
            ← Records一覧に戻る
          </Link>
          <div className="flex flex-col gap-2">
            <p className="text-xs uppercase tracking-wide text-zinc-500">
              Knot Records
            </p>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h1 className="text-3xl font-semibold text-zinc-900">
                  {record.caption || "写真記録"}
                </h1>
                <p className="mt-2 text-sm text-zinc-600">
                  {record.recordDate.toLocaleString("ja-JP", {
                    dateStyle: "medium",
                    timeStyle: "short",
                  })}
                </p>
              </div>
              {canDelete ? (
                <RecordDeleteButton
                  recordId={record.id}
                  recordCaption={record.caption}
                />
              ) : null}
            </div>
          </div>
          <div className="flex flex-wrap gap-2 text-sm text-zinc-600">
            <span className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-semibold text-zinc-600">
              {SOURCE_LABELS[record.sourceType] ?? record.sourceType}
            </span>
            <span>{record.fiscalYear}年度</span>
            <span>団体: {record.group.name}</span>
            <span>作成者: {record.createdBy.displayName}</span>
            {record.event ? (
              <Link
                href={`/events/${record.event.id}`}
                className="rounded-full border border-zinc-200 px-3 py-1 text-xs font-semibold text-sky-600"
              >
                関連イベント: {record.event.title}
              </Link>
            ) : null}
            {!record.event && record.sourceId ? (
              <span className="text-xs text-zinc-500">
                元データID: {record.sourceId}
              </span>
            ) : null}
          </div>
        </div>

        <section className="rounded-2xl border border-white bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-zinc-900">写真ギャラリー</h2>
          {record.photos.length === 0 ? (
            <p className="mt-4 text-sm text-zinc-500">
              写真が登録されていません。
            </p>
          ) : (
            <div className="mt-4">
              <RecordPhotoGallery photos={record.photos} />
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
