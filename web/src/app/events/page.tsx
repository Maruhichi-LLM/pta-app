import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getSessionFromCookies } from "@/lib/session";
import { EventList, type EventDisplay } from "@/components/event-list";
import { EventForm } from "@/components/event-form";
import { ROLE_ADMIN } from "@/lib/roles";

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

export default async function EventsPage() {
  const session = await getSessionFromCookies();
  if (!session) {
    redirect("/join");
  }

  const data = await fetchEventData(session.groupId, session.memberId);
  if (!data.group) {
    redirect("/join");
  }
  const canEdit = data.member?.role === ROLE_ADMIN;

  return (
    <div className="min-h-screen bg-zinc-50 px-4 py-10">
      <div className="mx-auto flex max-w-4xl flex-col gap-8">
        <header className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
          <p className="text-sm uppercase tracking-wide text-zinc-500">
            イベント / 出欠
          </p>
          <h1 className="text-3xl font-semibold text-zinc-900">
            {data.group.name}
          </h1>
          <p className="mt-2 text-sm text-zinc-600">
            予定の共有と参加可否を確認できます。
          </p>
          <Link
            href="/home"
            className="mt-4 inline-flex text-sm text-sky-600 underline"
          >
            ← ホームへ戻る
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

        {canEdit ? <EventForm mode="create" /> : null}

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
