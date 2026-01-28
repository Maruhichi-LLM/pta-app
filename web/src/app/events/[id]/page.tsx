import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getSessionFromCookies } from "@/lib/session";
import { ensureModuleEnabled, isModuleEnabled } from "@/lib/modules";
import { EventBudgetSection } from "@/components/event-budget-section";
import { RelatedThreadButton } from "@/components/related-thread-button";
import { ROLE_ADMIN } from "@/lib/roles";

const formatter = new Intl.DateTimeFormat("ja-JP", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Tokyo",
});

export default async function EventDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getSessionFromCookies();
  if (!session) {
    redirect("/join");
  }

  await ensureModuleEnabled(session.groupId, "event");

  const { id: eventIdString } = await params;
  const eventId = Number(eventIdString);

  const [event, budgetEnabled, recordsEnabled, member, thread] =
    await Promise.all([
    prisma.event.findFirst({
      where: { id: eventId, groupId: session.groupId },
      include: {
        attendances: {
          include: { member: true },
          orderBy: { respondedAt: "desc" },
        },
        budget: {
          include: {
            transactions: {
              include: {
                account: true,
                createdBy: { select: { id: true, displayName: true } },
              },
              orderBy: { transactionDate: "desc" },
            },
            imports: {
              include: {
                importedBy: { select: { id: true, displayName: true } },
              },
              orderBy: { importedAt: "desc" },
            },
            confirmedBy: { select: { id: true, displayName: true } },
          },
        },
      },
    }),
    isModuleEnabled(session.groupId, "event-budget"),
    isModuleEnabled(session.groupId, "record"),
    prisma.member.findUnique({
      where: { id: session.memberId },
    }),
    prisma.chatThread.findFirst({
      where: {
        groupId: session.groupId,
        sourceType: "EVENT",
        sourceId: eventId,
      },
      select: { id: true },
    }),
  ]);

  if (!event) {
    redirect("/events");
  }

  const canEdit = member?.role === ROLE_ADMIN;

  const attendanceCounts = event.attendances.reduce(
    (acc, attendance) => {
      acc[attendance.status] += 1;
      return acc;
    },
    { YES: 0, NO: 0, MAYBE: 0 }
  );

  const records = recordsEnabled
    ? await prisma.record.findMany({
        where: { eventId: event.id, groupId: session.groupId },
        orderBy: { recordDate: "desc" },
        include: {
          photos: {
            orderBy: { createdAt: "asc" },
            take: 3,
            select: { id: true, url: true },
          },
        },
      })
    : [];

  return (
    <div className="min-h-screen py-10">
      <div className="page-shell space-y-6">
        {/* イベント基本情報 */}
        <header className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[11px] uppercase tracking-wide text-zinc-400">
                {formatter.format(new Date(event.startsAt))}
                {event.endsAt
                  ? ` 〜 ${formatter.format(new Date(event.endsAt))}`
                  : ""}
              </p>
              <h1 className="mt-1 text-3xl font-semibold text-zinc-900">
                {event.title}
              </h1>
              {event.location && (
                <p className="mt-2 text-sm text-zinc-600">
                  📍 場所: {event.location}
                </p>
              )}
              {event.description && (
                <p className="mt-3 text-sm text-zinc-700">
                  {event.description}
                </p>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="rounded-full bg-emerald-50 px-2.5 py-1 font-semibold text-emerald-700">
                参加 {attendanceCounts.YES}
              </span>
              <span className="rounded-full bg-amber-50 px-2.5 py-1 font-semibold text-amber-700">
                未定 {attendanceCounts.MAYBE}
              </span>
              <span className="rounded-full bg-rose-50 px-2.5 py-1 font-semibold text-rose-700">
                不参加 {attendanceCounts.NO}
              </span>
            </div>
          </div>

          <div className="mt-4">
            <RelatedThreadButton
              groupId={session.groupId}
              sourceType="EVENT"
              sourceId={event.id}
              title={`Event: ${event.title}`}
              threadId={thread?.id ?? null}
            />
          </div>
        </header>

        {/* 参加者リスト */}
        <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-zinc-900">参加者一覧</h2>
          <p className="mt-1 text-sm text-zinc-500">
            回答者 {event.attendances.length} 名
          </p>
          {event.attendances.length > 0 ? (
            <div className="mt-4 space-y-2">
              {event.attendances.map((attendance) => (
                <div
                  key={`${attendance.eventId}-${attendance.memberId}`}
                  className="flex items-start justify-between rounded-lg border border-zinc-100 bg-zinc-50 p-3"
                >
                  <div>
                    <p className="font-medium text-zinc-900">
                      {attendance.member.displayName}
                    </p>
                    {attendance.comment && (
                      <p className="mt-1 text-sm text-zinc-600">
                        {attendance.comment}
                      </p>
                    )}
                    <p className="mt-1 text-xs text-zinc-400">
                      {formatter.format(new Date(attendance.respondedAt))}
                    </p>
                  </div>
                  <span
                    className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                      attendance.status === "YES"
                        ? "bg-emerald-50 text-emerald-700"
                        : attendance.status === "MAYBE"
                        ? "bg-amber-50 text-amber-700"
                        : "bg-rose-50 text-rose-700"
                    }`}
                  >
                    {attendance.status === "YES"
                      ? "参加"
                      : attendance.status === "MAYBE"
                      ? "未定"
                      : "不参加"}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-4 text-sm text-zinc-500">
              まだ回答はありません。
            </p>
          )}
        </section>

        {/* Records セクション */}
        {recordsEnabled ? (
          <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-zinc-900">
                  Knot Records
                </h2>
                <p className="mt-1 text-sm text-zinc-500">
                  このイベントの活動写真を記録します。
                </p>
              </div>
              <div className="flex flex-wrap gap-2 text-sm">
                <a
                  href={`/records?eventId=${event.id}`}
                  className="rounded-full border border-zinc-200 px-3 py-1 text-xs font-semibold text-zinc-600 hover:border-sky-300 hover:text-sky-600"
                >
                  Records一覧
                </a>
                <a
                  href={`/records/new?eventId=${event.id}&sourceType=EVENT&sourceId=${event.id}`}
                  className="rounded-full bg-sky-600 px-3 py-1 text-xs font-semibold text-white hover:bg-sky-700"
                >
                  写真を追加
                </a>
              </div>
            </div>
            {records.length === 0 ? (
              <p className="mt-4 text-sm text-zinc-500">
                まだ写真記録がありません。
              </p>
            ) : (
              <div className="mt-4 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {records.map((record) => (
                  <a
                    key={record.id}
                    href={`/records/${record.id}`}
                    className="group overflow-hidden rounded-2xl border border-zinc-200 bg-zinc-50"
                  >
                    <div className="grid grid-cols-3">
                      {record.photos.map((photo) => (
                        <div
                          key={photo.id}
                          className="aspect-square overflow-hidden"
                        >
                          <img
                            src={photo.url}
                            alt="Record photo"
                            className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
                            loading="lazy"
                          />
                        </div>
                      ))}
                      {record.photos.length < 3
                        ? Array.from({ length: 3 - record.photos.length }).map(
                            (_, index) => (
                              <div
                                key={`empty-${record.id}-${index}`}
                                className="aspect-square bg-zinc-100"
                              />
                            )
                          )
                        : null}
                    </div>
                    <div className="px-4 py-3 text-sm text-zinc-600">
                      {record.caption || "写真記録"}
                    </div>
                  </a>
                ))}
              </div>
            )}
          </section>
        ) : (
          <section className="rounded-2xl border border-dashed border-zinc-200 bg-zinc-50 p-6 text-sm text-zinc-500">
            Knot Records は現在無効です。モジュールを有効化すると写真記録を追加できます。
          </section>
        )}

        {/* 収支管理セクション（event-budget有効時のみ） */}
        {budgetEnabled && (
          <EventBudgetSection
            eventId={event.id}
            eventTitle={event.title}
            eventBudget={
              event.budget
                ? {
                    ...event.budget,
                    confirmedAt: event.budget.confirmedAt?.toISOString() ?? null,
                    importedToLedgerAt:
                      event.budget.importedToLedgerAt?.toISOString() ?? null,
                    transactions: event.budget.transactions.map((tx) => ({
                      ...tx,
                      transactionDate: tx.transactionDate.toISOString(),
                      createdAt: tx.createdAt.toISOString(),
                    })),
                    imports: event.budget.imports.map((imp) => ({
                      ...imp,
                      importedAt: imp.importedAt.toISOString(),
                    })),
                  }
                : null
            }
            canEdit={canEdit}
          />
        )}
      </div>
    </div>
  );
}
