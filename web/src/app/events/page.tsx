import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getSessionFromCookies } from "@/lib/session";
import { EventList, type EventDisplay } from "@/components/event-list";

async function fetchEventData(groupId: number) {
  const [group, events] = await Promise.all([
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
  };
}

export default async function EventsPage() {
  const session = await getSessionFromCookies();
  if (!session) {
    redirect("/join");
  }

  const data = await fetchEventData(session.groupId);
  if (!data.group) {
    redirect("/join");
  }

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
        </header>

        <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-zinc-900">
            今後のイベント
          </h2>
          <div className="mt-4">
            <EventList events={data.events} memberId={session.memberId} />
          </div>
        </section>
      </div>
    </div>
  );
}
