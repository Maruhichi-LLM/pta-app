import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getSessionFromCookies } from "@/lib/session";
import { EventList, type EventDisplay } from "@/components/event-list";
import { EventForm } from "@/components/event-form";
import { ROLE_ADMIN } from "@/lib/roles";
import { ensureModuleEnabled, isModuleEnabled } from "@/lib/modules";

function buildInitialStartsAt(date?: string) {
  if (!date) return undefined;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return undefined;
  const target = new Date(`${date}T09:00:00`);
  target.setMinutes(target.getMinutes() - target.getTimezoneOffset());
  return target.toISOString().slice(0, 16);
}

async function fetchEventData(groupId: number, memberId: number) {
  const [group, events, member, threads] = await Promise.all([
    prisma.group.findUnique({ where: { id: groupId } }),
    prisma.event.findMany({
      where: { groupId },
      include: {
        attendances: {
          include: { member: true },
          orderBy: { respondedAt: "desc" },
        },
      },
      orderBy: { startsAt: "asc" },
    }),
    prisma.member.findUnique({
      where: { id: memberId },
    }),
    prisma.chatThread.findMany({
      where: {
        groupId,
        sourceType: "EVENT",
      },
      select: {
        id: true,
        sourceId: true,
      },
    }),
  ]);

  // Create a map of eventId to threadId
  const threadMap = new Map(
    threads.map((thread) => [thread.sourceId, thread.id])
  );

  return {
    group,
    events: events.map((event) => ({
      id: event.id,
      title: event.title,
      description: event.description,
      location: event.location,
      startsAt: event.startsAt.toISOString(),
      endsAt: event.endsAt ? event.endsAt.toISOString() : null,
      threadId: threadMap.get(event.id) ?? null,
      attendances: event.attendances.map((attendance) => ({
        eventId: event.id,
        memberId: attendance.memberId,
        memberName: attendance.member.displayName,
        status: attendance.status,
        comment: attendance.comment,
        respondedAt: attendance.respondedAt.toISOString(),
      })),
    })) as EventDisplay[],
    member,
  };
}

export default async function EventsPage({
  searchParams,
}: {
  searchParams?: Promise<{ date?: string }>;
}) {
  const session = await getSessionFromCookies();
  if (!session) {
    redirect("/join");
  }

  await ensureModuleEnabled(session.groupId, "event");
  const data = await fetchEventData(session.groupId, session.memberId);
  if (!data.group) {
    redirect("/join");
  }
  const canEdit = data.member?.role === ROLE_ADMIN;
  const resolvedParams = (await searchParams) ?? {};
  const initialStartsAt = buildInitialStartsAt(resolvedParams.date);

  return (
    <div className="min-h-screen py-10">
      <div className="page-shell flex flex-col gap-8">
        <header className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
          <p className="text-sm uppercase tracking-wide text-zinc-500">
            Knot Event
          </p>
          <h1 className="text-3xl font-semibold text-zinc-900">
            {data.group.name}
          </h1>
          <p className="mt-2 text-sm text-zinc-600">
            予定の共有と参加可否を確認できます。
          </p>
          {canEdit ? (
            <div className="mt-4 flex flex-wrap gap-3 text-sm">
              <a
                href="/api/event-exports/csv"
                className="rounded-lg border border-zinc-300 px-4 py-2 text-zinc-600 hover:bg-zinc-50"
              >
                CSVダウンロード
              </a>
              <a
                href="/api/event-exports/pdf"
                className="rounded-lg border border-zinc-300 px-4 py-2 text-zinc-600 hover:bg-zinc-50"
              >
                PDFダウンロード
              </a>
            </div>
          ) : null}
        </header>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.8fr)_minmax(320px,1fr)]">
          <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-zinc-900">
                今後のイベント
              </h2>
              <p className="text-xs text-zinc-500">
                {data.events.length} 件の予定
              </p>
            </div>
            <div className="mt-4">
              <EventList
                events={data.events}
                memberId={session.memberId}
                groupId={session.groupId}
                canEdit={canEdit}
              />
            </div>
          </section>

          <aside className="rounded-2xl border border-dashed border-sky-200 bg-white/80 p-5 shadow-sm lg:sticky lg:top-24 lg:h-fit">
            <h3 className="text-base font-semibold text-zinc-900">
              新しくイベントを作成
            </h3>
            <p className="mt-1 text-sm text-zinc-600">
              タイトル・日時・場所を入力して保存してください。
            </p>
            {canEdit ? (
              <div id="create-event" className="mt-4">
                <EventForm mode="create" initialStartsAt={initialStartsAt} />
              </div>
            ) : (
              <p className="mt-4 text-sm text-zinc-500">
                イベントの登録は管理者のみが利用できます。
              </p>
            )}
          </aside>
        </div>
      </div>
    </div>
  );
}
