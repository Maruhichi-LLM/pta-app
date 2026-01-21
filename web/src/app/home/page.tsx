import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getSessionFromCookies } from "@/lib/session";
import { redirect } from "next/navigation";
import { LogoutButton } from "@/components/logout-button";
import { ROLE_ADMIN } from "@/lib/roles";
import { ensureModuleEnabled } from "@/lib/modules";

const WEEK_LABELS = ["日", "月", "火", "水", "木", "金", "土"];

const monthFormatter = new Intl.DateTimeFormat("ja-JP", {
  year: "numeric",
  month: "long",
});

const timeFormatter = new Intl.DateTimeFormat("ja-JP", {
  hour: "2-digit",
  minute: "2-digit",
});

async function fetchMember(memberId: number) {
  return prisma.member.findUnique({
    where: { id: memberId },
    include: { group: true },
  });
}

async function fetchMonthlyEvents(groupId: number) {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  startOfMonth.setHours(0, 0, 0, 0);
  const startOfNextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  startOfNextMonth.setHours(0, 0, 0, 0);

  return prisma.event.findMany({
    where: {
      groupId,
      startsAt: {
        gte: startOfMonth,
        lt: startOfNextMonth,
      },
    },
    orderBy: { startsAt: "asc" },
    select: {
      id: true,
      title: true,
      startsAt: true,
      attendances: {
        select: {
          status: true,
        },
      },
    },
  });
}

type MonthlyEvent = Awaited<ReturnType<typeof fetchMonthlyEvents>>[number];

type CalendarDay = {
  date: Date;
  key: string;
  isCurrentMonth: boolean;
  isToday: boolean;
  events: MonthlyEvent[];
};

function formatDayKey(date: Date) {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

function buildCalendar(reference: Date, events: MonthlyEvent[]): CalendarDay[] {
  const startOfMonth = new Date(
    reference.getFullYear(),
    reference.getMonth(),
    1
  );
  const endOfMonth = new Date(
    reference.getFullYear(),
    reference.getMonth() + 1,
    0
  );
  const calendarStart = new Date(startOfMonth);
  calendarStart.setDate(startOfMonth.getDate() - startOfMonth.getDay());
  const calendarEnd = new Date(endOfMonth);
  calendarEnd.setDate(endOfMonth.getDate() + (6 - endOfMonth.getDay()));

  const eventsByDay = events.reduce<Record<string, MonthlyEvent[]>>(
    (acc, event) => {
      const key = formatDayKey(event.startsAt);
      if (!acc[key]) acc[key] = [];
      acc[key].push(event);
      return acc;
    },
    {}
  );

  const todayKey = formatDayKey(new Date());
  const days: CalendarDay[] = [];

  for (
    let day = new Date(calendarStart);
    day <= calendarEnd;
    day.setDate(day.getDate() + 1)
  ) {
    const key = formatDayKey(day);
    days.push({
      date: new Date(day),
      key,
      isCurrentMonth: day.getMonth() === reference.getMonth(),
      isToday: key === todayKey,
      events: eventsByDay[key] ?? [],
    });
  }

  return days;
}

function summarizeAttendance(attendances: MonthlyEvent["attendances"]) {
  return attendances.reduce(
    (acc, attendance) => {
      acc[attendance.status] += 1;
      return acc;
    },
    { YES: 0, NO: 0, MAYBE: 0 }
  );
}

function formatDateParam(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export default async function HomePage() {
  const session = await getSessionFromCookies();
  if (!session) {
    redirect("/join");
  }
  await ensureModuleEnabled(session.groupId, "calendar");

  const member = await fetchMember(session.memberId);
  if (!member || !member.group) {
    redirect("/join");
  }

  const events = await fetchMonthlyEvents(member.groupId);
  const now = new Date();
  const days = buildCalendar(now, events);
  const canManageEvents = member.role === ROLE_ADMIN;

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white py-8">
      <div className="page-shell flex flex-col gap-8">
        <header className="rounded-3xl bg-gradient-to-r from-sky-600 to-cyan-500 p-6 text-white shadow-lg">
          <div className="flex flex-wrap items-center justify-between gap-6">
            <div>
              <p className="text-xs uppercase tracking-wide text-white/70">
                {member.group.fiscalYearStartMonth}月はじまり
              </p>
              <h1 className="mt-1 text-3xl font-semibold">{member.group.name}</h1>
              <p className="mt-2 text-sm text-white/80">
                ログイン中: {member.displayName}（{member.role}）
              </p>
            </div>
            <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center">
              <LogoutButton />
            </div>
          </div>
        </header>

        <section className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-sm uppercase tracking-wide text-sky-600">
                Knot Calendar
              </p>
              <h2 className="text-3xl font-semibold text-zinc-900">
                {monthFormatter.format(now)}
              </h2>
              <p className="mt-1 text-sm text-zinc-500">
                ここで行事と参加状況がひとつにつながります。
              </p>
            </div>
            <Link
              href="/events"
              className="text-sm font-medium text-sky-600 hover:text-sky-500"
            >
              イベント一覧を見る →
            </Link>
          </div>

          <div className="mt-6 grid grid-cols-7 gap-2 text-center text-xs font-semibold uppercase tracking-wide text-zinc-400">
            {WEEK_LABELS.map((label) => (
              <div key={label}>{label}</div>
            ))}
          </div>

          <div className="mt-2 grid grid-cols-7 gap-3">
            {days.map((day) => (
              <div
                key={day.key}
                className={`group relative min-h-[120px] rounded-2xl border px-3 pr-9 py-2 ${
                  day.isCurrentMonth ? "bg-white" : "bg-zinc-50 text-zinc-400"
                }`}
              >
                {canManageEvents ? (
                  <Link
                    href={`/events?date=${formatDateParam(day.date)}#create-event`}
                    className="absolute right-2 top-2 hidden h-7 w-7 items-center justify-center rounded-full border border-sky-200 bg-white text-lg font-bold text-sky-600 shadow-sm transition hover:bg-sky-600 hover:text-white group-focus-within:flex group-hover:flex"
                    title="この日にイベントを追加"
                  >
                    +
                  </Link>
                ) : null}
                <div className="flex items-center justify-between">
                  <p
                    className={`text-sm font-semibold ${
                      day.isCurrentMonth ? "text-zinc-800" : "text-zinc-400"
                    }`}
                  >
                    {day.date.getDate()}
                  </p>
                  {day.isToday ? (
                    <span className="rounded-full bg-sky-500 px-2 py-0.5 text-[10px] font-semibold text-white">
                      今日
                    </span>
                  ) : null}
                </div>
                <div className="mt-2 space-y-2">
                  {day.events.length === 0 ? (
                    <p className="text-[11px] text-zinc-400">予定なし</p>
                  ) : (
                    <>
                      {day.events.slice(0, 2).map((event) => {
                        const summary = summarizeAttendance(event.attendances);
                        return (
                          <Link
                            key={event.id}
                            href={`/events#event-${event.id}`}
                            className="block rounded-xl border border-sky-100 bg-sky-50 p-2 ring-sky-200 transition hover:ring-2"
                          >
                            <p className="text-xs font-semibold text-sky-900">
                              {event.title}
                            </p>
                            <p className="text-[11px] text-sky-800">
                              {timeFormatter.format(event.startsAt)}・参加
                              {summary.YES}／未定{summary.MAYBE}
                            </p>
                          </Link>
                        );
                      })}
                      {day.events.length > 2 ? (
                        <p className="text-[11px] text-sky-600">
                          ほか {day.events.length - 2} 件
                        </p>
                      ) : null}
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-3xl border border-dashed border-zinc-200 bg-white/60 p-6 text-sm text-zinc-600">
          <p className="font-medium text-zinc-900">これから実装予定の機能</p>
          <ul className="mt-3 list-disc space-y-1 pl-5">
            <li>イベント出欠の詳細管理とエクスポート強化</li>
            <li>会計の承認フローと証憑アップロード</li>
            <li>監査ログ・団体設定まわりの機能</li>
          </ul>
        </section>
      </div>
    </div>
  );
}
