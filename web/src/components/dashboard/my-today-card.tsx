import Link from "next/link";
import { DashboardCard } from "./dashboard-card";

export type TodoPreview = {
  id: number;
  title: string;
  dueLabel: string;
  dueTone: "overdue" | "today" | "tomorrow" | "upcoming" | "none";
  sourceLabel: string;
  href: string;
};

export type ApprovalPreview = {
  count: number;
  labels?: Array<{ label: string; count: number }>;
};

export type EventPreview = {
  id: number;
  title: string;
  dateLabel: string;
  attendanceLabel: string;
  attendanceTone: "yes" | "no" | "maybe" | "unanswered";
  href: string;
};

type Props = {
  todos: TodoPreview[];
  todosHasMore: boolean;
  approvals: ApprovalPreview;
  events: EventPreview[];
  eventsHasMore: boolean;
};

const dueToneStyles = {
  overdue: "text-rose-700 bg-rose-50",
  today: "text-amber-700 bg-amber-50",
  tomorrow: "text-sky-700 bg-sky-50",
  upcoming: "text-zinc-600 bg-zinc-100",
  none: "text-zinc-500 bg-zinc-100",
} as const;

const attendanceToneStyles = {
  yes: "text-emerald-700 bg-emerald-50",
  no: "text-rose-700 bg-rose-50",
  maybe: "text-amber-700 bg-amber-50",
  unanswered: "text-amber-700 bg-amber-50",
} as const;

export function MyTodayCard({
  todos,
  todosHasMore,
  approvals,
  events,
  eventsHasMore,
}: Props) {
  return (
    <DashboardCard title="あなたの今日" actionHref="/todo">
      <MyTodosPreview todos={todos} hasMore={todosHasMore} />
      <MyApprovalsPreview approvals={approvals} />
      <MyNextEventPreview events={events} hasMore={eventsHasMore} />
    </DashboardCard>
  );
}

export function MyTodosPreview({
  todos,
  hasMore,
}: {
  todos: TodoPreview[];
  hasMore: boolean;
}) {
  return (
    <section>
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-zinc-900">
          ToDo（未完了）
        </h3>
        <Link
          href="/todo"
          className="text-xs font-semibold text-sky-600 hover:text-sky-500"
        >
          ToDoへ
        </Link>
      </div>
      <div className="mt-3 space-y-2">
        {todos.length === 0 ? (
          <div className="rounded-xl border border-dashed border-zinc-200 p-4 text-sm text-zinc-500">
            <p>未完了のToDoはありません</p>
            <Link
              href="/todo"
              className="mt-2 inline-flex text-xs font-semibold text-sky-600 hover:text-sky-500"
            >
              ToDoを作る →
            </Link>
          </div>
        ) : (
          <>
            {todos.map((todo) => (
              <Link
                key={todo.id}
                href={todo.href}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-zinc-100 bg-zinc-50 px-3 py-2 text-sm transition hover:border-sky-200 hover:bg-sky-50"
              >
                <div>
                  <p className="font-semibold text-zinc-900">{todo.title}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-zinc-500">
                    <span
                      className={`rounded-full px-2 py-0.5 ${dueToneStyles[todo.dueTone]}`}
                    >
                      {todo.dueLabel}
                    </span>
                    <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-semibold text-zinc-600">
                      {todo.sourceLabel}
                    </span>
                  </div>
                </div>
              </Link>
            ))}
            {hasMore ? (
              <Link
                href="/todo"
                className="inline-flex text-xs font-semibold text-sky-600 hover:text-sky-500"
              >
                もっと見る →
              </Link>
            ) : null}
          </>
        )}
      </div>
    </section>
  );
}

export function MyApprovalsPreview({
  approvals,
}: {
  approvals: ApprovalPreview;
}) {
  return (
    <section>
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-zinc-900">
          あなたの承認待ち
        </h3>
        <Link
          href="/workflow/applications"
          className="text-xs font-semibold text-sky-600 hover:text-sky-500"
        >
          承認へ
        </Link>
      </div>
      <div className="mt-3">
        {approvals.count === 0 ? (
          <div className="rounded-xl border border-dashed border-zinc-200 p-4 text-sm text-zinc-500">
            <p>承認待ちはありません</p>
            <Link
              href="/workflow/applications"
              className="mt-2 inline-flex text-xs font-semibold text-sky-600 hover:text-sky-500"
            >
              申請一覧へ →
            </Link>
          </div>
        ) : (
          <div className="rounded-xl border border-zinc-100 bg-zinc-50 p-4 text-sm text-zinc-700">
            <p className="text-lg font-semibold text-zinc-900">
              承認待ち {approvals.count} 件
            </p>
            {approvals.labels && approvals.labels.length > 0 ? (
              <div className="mt-2 flex flex-wrap gap-2 text-xs text-zinc-500">
                {approvals.labels.map((label) => (
                  <span
                    key={label.label}
                    className="rounded-full bg-white px-2 py-0.5 font-semibold"
                  >
                    {label.label} {label.count}
                  </span>
                ))}
              </div>
            ) : null}
          </div>
        )}
      </div>
    </section>
  );
}

export function MyNextEventPreview({
  events,
  hasMore,
}: {
  events: EventPreview[];
  hasMore: boolean;
}) {
  return (
    <section>
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-zinc-900">
          あなたの直近イベント
        </h3>
        <Link
          href="/events"
          className="text-xs font-semibold text-sky-600 hover:text-sky-500"
        >
          イベントへ
        </Link>
      </div>
      <div className="mt-3 space-y-2">
        {events.length === 0 ? (
          <div className="rounded-xl border border-dashed border-zinc-200 p-4 text-sm text-zinc-500">
            <p>直近のイベントはありません</p>
            <Link
              href="/events"
              className="mt-2 inline-flex text-xs font-semibold text-sky-600 hover:text-sky-500"
            >
              イベントを作成 →
            </Link>
          </div>
        ) : (
          <>
            {events.map((event) => (
              <Link
                key={event.id}
                href={event.href}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-zinc-100 bg-zinc-50 px-3 py-2 text-sm transition hover:border-sky-200 hover:bg-sky-50"
              >
                <div>
                  <p className="font-semibold text-zinc-900">{event.title}</p>
                  <p className="mt-1 text-xs text-zinc-500">{event.dateLabel}</p>
                </div>
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-semibold ${attendanceToneStyles[event.attendanceTone]}`}
                >
                  {event.attendanceLabel}
                </span>
              </Link>
            ))}
            {hasMore ? (
              <Link
                href="/events"
                className="inline-flex text-xs font-semibold text-sky-600 hover:text-sky-500"
              >
                もっと見る →
              </Link>
            ) : null}
          </>
        )}
      </div>
    </section>
  );
}
