import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getSessionFromCookies } from "@/lib/session";
import { isPlatformAdminEmail } from "@/lib/admin";
import { ensureModuleEnabled } from "@/lib/modules";
import { getFiscalYear, resolveFiscalYearStartMonth } from "@/lib/fiscal-year";

const SOURCE_LABELS: Record<string, string> = {
  CHAT: "Chat",
  TODO: "ToDo",
  EVENT: "Event",
};

type RecordsPageProps = {
  searchParams?: Promise<{
    fiscalYear?: string;
    eventId?: string;
  }>;
};

export default async function RecordsPage({ searchParams }: RecordsPageProps) {
  const session = await getSessionFromCookies();
  if (!session) {
    redirect("/join");
  }

  await ensureModuleEnabled(session.groupId, "record");

  const member = await prisma.member.findUnique({
    where: { id: session.memberId },
    select: { email: true },
  });
  const isAdmin = isPlatformAdminEmail(member?.email ?? null);

  const resolvedParams = (await searchParams) ?? {};
  const fiscalYearParam = Number(resolvedParams.fiscalYear ?? "");
  const eventIdParam = Number(resolvedParams.eventId ?? "");

  const where: Record<string, unknown> = {};
  if (!isAdmin) {
    where.groupId = session.groupId;
  }
  if (!Number.isNaN(fiscalYearParam) && fiscalYearParam > 0) {
    where.fiscalYear = fiscalYearParam;
  }
  if (!Number.isNaN(eventIdParam) && eventIdParam > 0) {
    where.eventId = eventIdParam;
  }

  const [records, events, fiscalYearStartMonth] = await Promise.all([
    prisma.record.findMany({
      where,
      orderBy: { recordDate: "desc" },
      include: {
        event: { select: { id: true, title: true } },
        createdBy: { select: { id: true, displayName: true } },
        group: { select: { id: true, name: true } },
        photos: {
          orderBy: { createdAt: "asc" },
          select: { id: true, url: true },
        },
      },
    }),
    prisma.event.findMany({
      where: { groupId: session.groupId },
      orderBy: { startsAt: "desc" },
      select: { id: true, title: true },
    }),
    resolveFiscalYearStartMonth(session.groupId),
  ]);

  const currentFiscalYear = getFiscalYear(new Date(), fiscalYearStartMonth);

  return (
    <div className="min-h-screen py-10">
      <div className="page-shell space-y-8">
        <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6 text-sm text-emerald-900 shadow-sm">
          Knot Records は、活動の瞬間を写真で残すための記録モジュールです。
          文書や報告書ではなく、現場の証跡を写真だけで保存します。
        </section>

        <section className="rounded-2xl border border-white bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-xs uppercase tracking-wide text-zinc-500">
                Knot Records
              </p>
              <h1 className="text-3xl font-semibold text-zinc-900">Records</h1>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <form
                className="flex flex-wrap items-center gap-3 text-sm"
                action="/records"
                method="get"
              >
                <select
                  name="fiscalYear"
                  defaultValue={
                    !Number.isNaN(fiscalYearParam) && fiscalYearParam > 0
                      ? String(fiscalYearParam)
                      : ""
                  }
                  className="rounded-full border border-zinc-200 px-3 py-1.5"
                >
                  <option value="">年度（すべて）</option>
                  {[currentFiscalYear, currentFiscalYear - 1, currentFiscalYear - 2].map(
                    (year) => (
                      <option key={year} value={year}>
                        {year}年度
                      </option>
                    )
                  )}
                </select>
                <select
                  name="eventId"
                  defaultValue={
                    !Number.isNaN(eventIdParam) && eventIdParam > 0
                      ? String(eventIdParam)
                      : ""
                  }
                  className="rounded-full border border-zinc-200 px-3 py-1.5"
                >
                  <option value="">イベント（すべて）</option>
                  {events.map((event) => (
                    <option key={event.id} value={event.id}>
                      {event.title}
                    </option>
                  ))}
                </select>
                <button
                  type="submit"
                  className="rounded-full bg-zinc-900 px-4 py-1.5 text-white"
                >
                  絞り込む
                </button>
              </form>
              <Link
                href="/records/new"
                className="rounded-full bg-sky-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-sky-700"
              >
                新規作成
              </Link>
            </div>
          </div>

          {records.length === 0 ? (
            <div className="mt-6 rounded-2xl border border-dashed border-zinc-200 p-10 text-center text-sm text-zinc-500">
              まだ写真記録がありません。新規作成から写真を追加してください。
            </div>
          ) : (
            <div className="mt-6 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
              {records.map((record) => {
                const cover = record.photos[0];
                return (
                  <Link
                    key={record.id}
                    href={`/records/${record.id}`}
                    className="group flex h-full flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm transition hover:border-sky-200 hover:shadow"
                  >
                    <div className="relative aspect-[4/3] w-full overflow-hidden bg-zinc-100">
                      {cover ? (
                        <img
                          src={cover.url}
                          alt={record.caption ?? "Record photo"}
                          className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
                          loading="lazy"
                        />
                      ) : (
                        <div className="flex h-full items-center justify-center text-sm text-zinc-400">
                          No Photo
                        </div>
                      )}
                      <span className="absolute right-3 top-3 rounded-full bg-black/60 px-2 py-1 text-xs font-semibold text-white">
                        {record.photos.length}枚
                      </span>
                    </div>
                    <div className="flex flex-1 flex-col gap-2 p-4">
                      <div className="text-xs uppercase tracking-wide text-zinc-400">
                        {SOURCE_LABELS[record.sourceType] ?? record.sourceType}
                      </div>
                      <p className="text-sm font-semibold text-zinc-900">
                        {record.caption || record.event?.title || "写真記録"}
                      </p>
                      <p className="text-xs text-zinc-500">
                        {record.recordDate.toLocaleString("ja-JP", {
                          dateStyle: "medium",
                          timeStyle: "short",
                        })}
                      </p>
                      {record.event ? (
                        <p className="text-xs text-sky-600">
                          関連イベント: {record.event.title}
                        </p>
                      ) : null}
                      {isAdmin ? (
                        <p className="text-xs text-zinc-400">
                          団体: {record.group.name}
                        </p>
                      ) : null}
                      <p className="mt-auto text-xs text-zinc-400">
                        作成者: {record.createdBy.displayName}
                      </p>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
