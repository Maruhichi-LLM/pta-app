"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";

export type EventAttendanceDisplay = {
  eventId: number;
  memberId: number;
  memberName: string;
  status: "YES" | "NO" | "MAYBE";
  comment: string | null;
  respondedAt: string;
};

export type EventDisplay = {
  id: number;
  title: string;
  description?: string | null;
  location?: string | null;
  startsAt: string;
  endsAt?: string | null;
  attendances: EventAttendanceDisplay[];
};

type Props = {
  events: EventDisplay[];
  memberId: number;
};

const formatter = new Intl.DateTimeFormat("ja-JP", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Tokyo",
});

const statusLabels = {
  YES: "参加",
  MAYBE: "未定",
  NO: "不参加",
};

export function EventList({ events, memberId }: Props) {
  if (events.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-zinc-300 p-6 text-center text-sm text-zinc-500">
        予定されているイベントはありません。
      </p>
    );
  }

  return (
    <div className="space-y-6">
      {events.map((event) => (
        <EventCard key={event.id} event={event} memberId={memberId} />
      ))}
    </div>
  );
}

function EventCard({ event, memberId }: { event: EventDisplay; memberId: number }) {
  const router = useRouter();
  const existing = event.attendances.find((item) => item.memberId === memberId);
  const [status, setStatus] = useState<"YES" | "NO" | "MAYBE">(
    existing?.status ?? "MAYBE"
  );
  const [comment, setComment] = useState(existing?.comment ?? "");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    setStatus(existing?.status ?? "MAYBE");
    setComment(existing?.comment ?? "");
  }, [existing?.status, existing?.comment]);

  async function handleSubmit(eventForm: FormEvent<HTMLFormElement>) {
    eventForm.preventDefault();
    setIsSubmitting(true);
    setError(null);
    try {
      const response = await fetch(`/api/events/${event.id}/attendance`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, comment }),
      });
      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as {
          error?: string;
        };
        setError(data.error ?? "更新に失敗しました。");
        return;
      }
      router.refresh();
    } catch {
      setError("通信エラーが発生しました。");
    } finally {
      setIsSubmitting(false);
    }
  }

  const counts = event.attendances.reduce(
    (acc, attendance) => {
      acc[attendance.status] += 1;
      return acc;
    },
    { YES: 0, NO: 0, MAYBE: 0 }
  );

  return (
    <article className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-wide text-zinc-400">
            {formatter.format(new Date(event.startsAt))}
            {event.endsAt
              ? ` 〜 ${formatter.format(new Date(event.endsAt))}`
              : ""}
          </p>
          <h3 className="text-2xl font-semibold text-zinc-900">{event.title}</h3>
          {event.location ? (
            <p className="text-sm text-zinc-500">場所: {event.location}</p>
          ) : null}
        </div>
        <div className="rounded-lg bg-zinc-100 px-3 py-2 text-sm text-zinc-600">
          <p>参加: {counts.YES}</p>
          <p>未定: {counts.MAYBE}</p>
          <p>不参加: {counts.NO}</p>
        </div>
      </div>
      {event.description ? (
        <p className="mt-3 text-sm text-zinc-600">{event.description}</p>
      ) : null}

      <form onSubmit={handleSubmit} className="mt-4 space-y-3">
        <div className="flex flex-wrap gap-3">
          {(Object.keys(statusLabels) as Array<"YES" | "NO" | "MAYBE">).map(
            (value) => (
              <label
                key={value}
                className={`flex cursor-pointer items-center gap-2 rounded-full border px-4 py-2 text-sm ${
                  status === value
                    ? "border-sky-500 bg-sky-50 text-sky-700"
                    : "border-zinc-300 text-zinc-600"
                }`}
              >
                <input
                  type="radio"
                  className="hidden"
                  checked={status === value}
                  onChange={() => setStatus(value)}
                />
                {statusLabels[value]}
              </label>
            )
          )}
        </div>
        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
          placeholder="備考（任意）"
          rows={2}
        />
        {error ? (
          <p className="text-sm text-red-600" role="alert">
            {error}
          </p>
        ) : null}
        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full rounded-lg bg-sky-600 py-2 text-white transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:bg-sky-300"
        >
          {isSubmitting ? "送信中..." : "出欠を送信"}
        </button>
      </form>

      {event.attendances.length > 0 ? (
        <div className="mt-4 rounded-lg bg-zinc-50 p-4 text-sm text-zinc-600">
          <p className="font-medium text-zinc-700">参加状況</p>
          <ul className="mt-2 space-y-1">
            {event.attendances.map((attendance) => (
              <li key={`${attendance.eventId}-${attendance.memberId}`}>
                {formatter.format(new Date(attendance.respondedAt))} -{" "}
                {attendance.memberName} : {statusLabels[attendance.status]}
                {attendance.comment ? `（${attendance.comment}）` : ""}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </article>
  );
}
