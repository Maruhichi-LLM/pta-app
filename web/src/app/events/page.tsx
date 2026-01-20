import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getSessionFromCookies } from "@/lib/session";
import { EventList, type EventDisplay } from "@/components/event-list";
import { EventForm } from "@/components/event-form";
import { ROLE_ADMIN } from "@/lib/roles";
import { ensureModuleEnabled } from "@/lib/modules";
import { KNOT_CALENDAR_PATH } from "@/lib/routes";

function buildInitialStartsAt(date?: string) {
  if (!date) return undefined;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return undefined;
  const target = new Date(`${date}T09:00:00`);
  target.setMinutes(target.getMinutes() - target.getTimezoneOffset());
  return target.toISOString().slice(0, 16);
}

async function fetchEventData(groupId: number, memberId: number) {
  const [group, events, member] = await Promise.all([
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
  ]);

  return {
    group,
    events: events.map((event) => ({
      id: event.id,
      title: event.title,
      description: event.description,
      location: event.location,
      startsAt: event.startsAt.toISOString(),
      endsAt: event.endsAt ? event.endsAt.toISOString() : null,
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

function CalendarPlaceholder() {
  return (
    <div className="min-h-[60vh] rounded-2xl border border-dashed border-zinc-200 bg-white/80 p-8 text-center shadow-sm">
      <p className="text-sm uppercase tracking-wide text-zinc-500">
        Knot Calendar
      </p>
      <h1 className="mt-3 text-3xl font-semibold text-zinc-900">
        ここから予定表を結びます
      </h1>
      <p className="mt-4 text-sm text-zinc-600">
        共有カレンダーやメンバー連携のビューを今後追加予定です。
      </p>
    </div>
  );
}

export default async function EventsPage({
  searchParams,
}: {
  searchParams: { date?: string; module?: string };
}) {
  const session = await getSessionFromCookies();
  if (!session) {
    redirect("/join");
  }

  if (searchParams?.module === "calendar") {
    await ensureModuleEnabled(session.groupId, "calendar");
    const group = await prisma.group.findUnique({
      where: { id: session.groupId },
      select: { name: true },
    });
    return (
      <div className="min-h-screen bg-zinc-50 px-4 py-10">
        <div className="mx-auto flex max-w-4xl flex-col gap-8">
          <header className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
            <p className="text-sm uppercase tracking-wide text-zinc-500">
              Knot Calendar
            </p>
            <h1 className="text-3xl font-semibold text-zinc-900">
              {group?.name ?? ""}
            </h1>
            <p className="mt-2 text-sm text-zinc-600">
              カレンダー専用ビューは今後追加予定です。
            </p>
            <Link
              href={KNOT_CALENDAR_PATH}
              className="mt-4 inline-flex text-sm text-sky-600 underline"
            >
              ← Knot Calendar へ戻る
            </Link>
          </header>
          <CalendarPlaceholder />
        </div>
      </div>
    );
  }

  await ensureModuleEnabled(session.groupId, "event");
  const data = await fetchEventData(session.groupId, session.memberId);
  if (!data.group) {
    redirect("/join");
  }
  const canEdit = data.member?.role === ROLE_ADMIN;
  const initialStartsAt = buildInitialStartsAt(searchParams?.date);

  return (
    <div className="min-h-screen bg-zinc-50 px-4 py-10">
      <div className="mx-auto flex max-w-4xl flex-col gap-8">
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
          <Link
            href={KNOT_CALENDAR_PATH}
            className="mt-4 inline-flex text-sm text-sky-600 underline"
          >
            ← Knot Calendar へ戻る
          </Link>
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

        {canEdit ? (
          <div id="create-event">
            <EventForm mode="create" initialStartsAt={initialStartsAt} />
          </div>
        ) : null}

        <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-zinc-900">
            今後のイベント
          </h2>
          <div className="mt-4">
            <EventList
              events={data.events}
              memberId={session.memberId}
              canEdit={canEdit}
            />
          </div>
        </section>
      </div>
    </div>
  );
}
