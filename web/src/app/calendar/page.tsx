import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getSessionFromCookies } from "@/lib/session";
import { ensureModuleEnabled, isModuleEnabled } from "@/lib/modules";
import { CalendarCreatePanel } from "@/components/calendar-create-panel";
import { GroupAvatar } from "@/components/group-avatar";

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

function buildRange(date: Date) {
  const start = new Date(date.getFullYear(), date.getMonth(), 1);
  start.setHours(0, 0, 0, 0);
  const end = new Date(date.getFullYear(), date.getMonth() + 1, 1);
  end.setHours(0, 0, 0, 0);
  return { start, end };
}

async function fetchMonthlyEvents(groupId: number, range: { start: Date; end: Date }) {
  return prisma.event.findMany({
    where: {
      groupId,
      startsAt: {
        gte: range.start,
        lt: range.end,
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

async function fetchPersonalEvents(memberId: number, range: { start: Date; end: Date }) {
  return prisma.personalEvent.findMany({
    where: {
      memberId,
      startsAt: {
        gte: range.start,
        lt: range.end,
      },
    },
    orderBy: { startsAt: "asc" },
  });
}

type PersonalEvent = Awaited<ReturnType<typeof fetchPersonalEvents>>[number];
type GroupEvent = Awaited<ReturnType<typeof fetchMonthlyEvents>>[number] & {
  calendar: "group";
};
type MonthlyEvent = GroupEvent | (PersonalEvent & { calendar: "personal" });

type CalendarDay = {
  key: string;
  date: Date;
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

  const eventMap = events.reduce<Record<string, MonthlyEvent[]>>(
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
      key,
      date: new Date(day),
      isCurrentMonth: day.getMonth() === reference.getMonth(),
      isToday: key === todayKey,
      events: eventMap[key] ?? [],
    });
  }
  return days;
}

function summarizeAttendance(attendances: GroupEvent["attendances"]) {
  return (
    attendances?.reduce(
      (acc, attendance) => {
        acc[attendance.status] += 1;
        return acc;
      },
      { YES: 0, MAYBE: 0, NO: 0 }
    ) ?? { YES: 0, MAYBE: 0, NO: 0 }
  );
}

function formatDateParam(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatMonthParam(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

export default async function CalendarPage({
  searchParams,
}: {
  searchParams?: Promise<{ addDate?: string; month?: string }>;
}) {
  const session = await getSessionFromCookies();
  if (!session) {
    redirect("/join");
  }
  await ensureModuleEnabled(session.groupId, "calendar");

  const member = await fetchMember(session.memberId);
  if (!member || !member.group) {
    redirect("/join");
  }

  const resolvedParams = (await searchParams) ?? {};
  const monthParam = resolvedParams.month;

  // monthパラメータから表示月を決定（形式: YYYY-MM）
  let displayMonth: Date;
  if (monthParam && /^\d{4}-\d{2}$/.test(monthParam)) {
    const [year, month] = monthParam.split("-").map(Number);
    displayMonth = new Date(year, month - 1, 1);
  } else {
    displayMonth = new Date();
  }

  const range = buildRange(displayMonth);
  const [groupEvents, personalEvents, budgetEnabled] = await Promise.all([
    fetchMonthlyEvents(member.groupId, range),
    fetchPersonalEvents(session.memberId, range),
    isModuleEnabled(session.groupId, "event-budget"),
  ]);
  const combinedEvents: MonthlyEvent[] = [
    ...groupEvents.map((event) => ({ ...event, calendar: "group" as const })),
    ...personalEvents.map((event) => ({ ...event, calendar: "personal" as const })),
  ];
  const days = buildCalendar(displayMonth, combinedEvents);
  const addDateParam = resolvedParams.addDate;
  const addDate = addDateParam
    ? new Date(addDateParam)
    : null;
  const isValidAddDate = addDate && !isNaN(addDate.getTime());
  const addDateString = isValidAddDate
    ? addDate!.toISOString().slice(0, 10)
    : null;

  // 前月・次月の日付を計算
  const prevMonth = new Date(displayMonth.getFullYear(), displayMonth.getMonth() - 1, 1);
  const nextMonth = new Date(displayMonth.getFullYear(), displayMonth.getMonth() + 1, 1);

  // 月ナビゲーションのURLを構築（addDateパラメータを保持）
  const prevMonthUrl = addDateParam
    ? `/calendar?month=${formatMonthParam(prevMonth)}&addDate=${addDateParam}`
    : `/calendar?month=${formatMonthParam(prevMonth)}`;
  const nextMonthUrl = addDateParam
    ? `/calendar?month=${formatMonthParam(nextMonth)}&addDate=${addDateParam}`
    : `/calendar?month=${formatMonthParam(nextMonth)}`;

  return (
    <div className="min-h-screen py-10">
      <div className="page-shell flex flex-col gap-8">
        <header className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex-1">
              <div className="flex items-start gap-4">
                <GroupAvatar
                  name={member.group.name}
                  logoUrl={member.group.logoUrl}
                  sizeClassName="h-12 w-12"
                />
                <div>
                  <p className="text-sm uppercase tracking-wide text-sky-600">
                    Knot Calendar
                  </p>
                  <h1 className="mt-1 text-3xl font-semibold text-zinc-900">
                    団体の予定が、一目でわかる。
                  </h1>
                  <p className="mt-2 text-sm text-zinc-600">
                    団体のイベントや予定を、月単位で一覧・把握できるカレンダー。
                  </p>
                </div>
              </div>
              <div className="mt-4 flex items-center gap-3">
                <Link
                  href={prevMonthUrl}
                  className="rounded-full p-2 text-zinc-600 transition hover:bg-zinc-100"
                  title="前月"
                >
                  ←
                </Link>
                <h2 className="text-2xl font-semibold text-zinc-900">
                  {monthFormatter.format(displayMonth)}
                </h2>
                <Link
                  href={nextMonthUrl}
                  className="rounded-full p-2 text-zinc-600 transition hover:bg-zinc-100"
                  title="次月"
                >
                  →
                </Link>
              </div>
              <p className="mt-1 text-sm text-zinc-600">
                {member.group.name} / {member.displayName}
              </p>
            </div>
            <Link
              href="/events"
              className="rounded-full border border-sky-200 px-4 py-2 text-sm font-semibold text-sky-600 hover:bg-sky-50"
            >
              イベント管理へ
            </Link>
          </div>
        </header>

        <section className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
          {addDateString ? (
            <div className="mb-6">
              <CalendarCreatePanel
                dateString={addDateString}
                memberName={member.displayName}
                groupName={member.group.name}
                budgetEnabled={budgetEnabled}
              />
            </div>
          ) : null}
          <div className="grid grid-cols-7 gap-2 text-center text-xs font-semibold uppercase tracking-wide text-zinc-500">
            {WEEK_LABELS.map((label) => (
              <span key={label}>{label}</span>
            ))}
          </div>
          <div className="mt-2 grid grid-cols-7 gap-3 text-sm">
            {days.map((day) => (
              <div
                key={day.key}
                className={`group relative min-h-[130px] rounded-2xl border px-3 pb-4 pt-2 transition ${
                  day.isCurrentMonth
                    ? "bg-white"
                    : "bg-zinc-50 text-zinc-400"
                }`}
              >
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
                <Link
                  href={`/calendar?addDate=${formatDateParam(day.date)}`}
                  className="absolute right-3 top-3 hidden h-8 w-8 items-center justify-center rounded-full border border-sky-200 bg-white text-lg font-bold text-sky-600 transition hover:bg-sky-600 hover:text-white group-hover:flex"
                  title="この日の予定を追加"
                >
                  +
                </Link>
                <div className="mt-2 space-y-2">
                  {day.events.length === 0 ? (
                    <p className="text-[11px] text-zinc-400">予定なし</p>
                  ) : (
                    <>
                      {day.events.slice(0, 2).map((event) => {
                        if (event.calendar === "personal") {
                          return (
                            <Link
                              key={event.id}
                              href={`/calendar?focus=personal&eventId=${event.id}`}
                              className="block rounded-xl border border-emerald-100 bg-emerald-50 p-2 text-[11px] text-emerald-900 transition hover:ring-2 hover:ring-emerald-200"
                            >
                              <p className="font-semibold">{event.title}</p>
                              <p className="text-[10px]">
                                {timeFormatter.format(event.startsAt)}
                                {event.endsAt
                                  ? ` 〜 ${timeFormatter.format(event.endsAt)}`
                                  : ""}
                              </p>
                            </Link>
                          );
                        } else {
                          const summary = summarizeAttendance(event.attendances);
                          return (
                            <Link
                              key={event.id}
                              href={`/events#event-${event.id}`}
                              className="block rounded-xl border border-sky-100 bg-sky-50 p-2 text-[11px] text-sky-900 transition hover:ring-2 hover:ring-sky-200"
                            >
                              <p className="font-semibold">{event.title}</p>
                              <p className="text-[10px]">
                                {timeFormatter.format(event.startsAt)} /
                                参加{summary.YES}・未定{summary.MAYBE}
                              </p>
                            </Link>
                          );
                        }
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
      </div>
    </div>
  );
}
