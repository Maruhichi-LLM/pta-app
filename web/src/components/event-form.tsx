"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { EventDisplay } from "./event-list";

type Props = {
  mode: "create" | "edit";
  event?: EventDisplay;
  onClose?: () => void;
};

function toInputValue(date?: string | null) {
  if (!date) return "";
  const instance = new Date(date);
  instance.setMinutes(instance.getMinutes() - instance.getTimezoneOffset());
  return instance.toISOString().slice(0, 16);
}

export function EventForm({ mode, event, onClose }: Props) {
  const router = useRouter();
  const [title, setTitle] = useState(event?.title ?? "");
  const [description, setDescription] = useState(event?.description ?? "");
  const [location, setLocation] = useState(event?.location ?? "");
  const [startsAt, setStartsAt] = useState(
    toInputValue(event?.startsAt) || new Date().toISOString().slice(0, 16)
  );
  const [endsAt, setEndsAt] = useState(toInputValue(event?.endsAt));
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(eventForm: React.FormEvent<HTMLFormElement>) {
    eventForm.preventDefault();
    setIsSubmitting(true);
    setError(null);

    const payload = {
      title,
      description,
      location,
      startsAt,
      endsAt,
    };

    try {
      const response = await fetch(
        mode === "create" ? "/api/events" : `/api/events/${event?.id}`,
        {
          method: mode === "create" ? "POST" : "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );

      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as {
          error?: string;
        };
        setError(data.error ?? "保存に失敗しました。");
        return;
      }

      router.refresh();
      onClose?.();
      if (mode === "create") {
        setTitle("");
        setDescription("");
        setLocation("");
        const now = new Date();
        setStartsAt(now.toISOString().slice(0, 16));
        setEndsAt("");
      }
    } catch {
      setError("通信エラーが発生しました。");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-3 rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm"
    >
      <h2 className="text-lg font-semibold text-zinc-900">
        {mode === "create" ? "イベントを作成" : "イベントを編集"}
      </h2>
      <label className="block text-sm text-zinc-600">
        タイトル
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
          required
        />
      </label>
      <label className="block text-sm text-zinc-600">
        説明
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
          rows={3}
        />
      </label>
      <label className="block text-sm text-zinc-600">
        場所
        <input
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
        />
      </label>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="text-sm text-zinc-600">
          開始日時
          <input
            type="datetime-local"
            value={startsAt}
            onChange={(e) => setStartsAt(e.target.value)}
            className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
            required
          />
        </label>
        <label className="text-sm text-zinc-600">
          終了日時（任意）
          <input
            type="datetime-local"
            value={endsAt ?? ""}
            onChange={(e) => setEndsAt(e.target.value)}
            className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
          />
        </label>
      </div>
      {error ? (
        <p className="text-sm text-red-600" role="alert">
          {error}
        </p>
      ) : null}
      <div className="flex gap-3">
        <button
          type="submit"
          disabled={isSubmitting}
          className="flex-1 rounded-lg bg-sky-600 py-2 text-white transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:bg-sky-300"
        >
          {isSubmitting ? "保存中..." : "保存"}
        </button>
        {onClose ? (
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-zinc-300 px-4 py-2 text-sm text-zinc-600"
          >
            キャンセル
          </button>
        ) : null}
      </div>
    </form>
  );
}
