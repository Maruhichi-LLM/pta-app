"use client";

import { FormEvent, useRef, useState } from "react";
import { useRouter } from "next/navigation";

const SOURCE_LABELS = {
  EVENT: "Event",
  CHAT: "Chat",
  TODO: "ToDo",
} as const;

type SourceType = keyof typeof SOURCE_LABELS;

type Props = {
  isAdmin: boolean;
  adminGroups?: Array<{ id: number; name: string }>;
  defaultGroupId: number;
  events: Array<{ id: number; title: string }>;
};

export function RecordCreateForm({
  isAdmin,
  adminGroups = [],
  defaultGroupId,
  events,
}: Props) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [sourceType, setSourceType] = useState<SourceType>("EVENT");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (!fileInputRef.current?.files || fileInputRef.current.files.length === 0) {
      setError("写真ファイルを選択してください。");
      return;
    }

    setIsSubmitting(true);

    try {
      const formData = new FormData(event.currentTarget);
      const response = await fetch("/api/records", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as {
          error?: string;
        };
        setError(data.error ?? "保存に失敗しました。");
        return;
      }

      const data = (await response.json().catch(() => ({}))) as {
        recordId?: number;
      };

      router.push(data.recordId ? `/records/${data.recordId}` : "/records");
      router.refresh();
    } catch {
      setError("通信エラーが発生しました。");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mt-6 grid gap-4 md:grid-cols-2">
      {isAdmin ? (
        <label className="text-sm text-zinc-600">
          団体
          <select
            name="groupId"
            className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
          >
            {adminGroups.map((group) => (
              <option key={group.id} value={group.id}>
                {group.name}
              </option>
            ))}
          </select>
        </label>
      ) : (
        <input type="hidden" name="groupId" value={defaultGroupId} />
      )}

      <label className="text-sm text-zinc-600">
        関連イベント（推奨）
        <select
          name="eventId"
          className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
          defaultValue=""
        >
          <option value="">イベント未選択</option>
          {events.map((eventItem) => (
            <option key={eventItem.id} value={eventItem.id}>
              {eventItem.title}
            </option>
          ))}
        </select>
      </label>

      <label className="text-sm text-zinc-600">
        記録元モジュール
        <select
          name="sourceType"
          value={sourceType}
          onChange={(event) => setSourceType(event.target.value as SourceType)}
          className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
        >
          {Object.entries(SOURCE_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>

      <label className="text-sm text-zinc-600">
        元データID（任意）
        <input
          type="number"
          name="sourceId"
          className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
          placeholder={sourceType === "EVENT" ? "イベントID" : "元データID"}
        />
      </label>

      <label className="text-sm text-zinc-600 md:col-span-2">
        キャプション（1行）
        <input
          name="caption"
          maxLength={255}
          className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
          placeholder="現場のメモを短く記録（任意）"
        />
      </label>

      <label className="text-sm text-zinc-600 md:col-span-2">
        写真（複数可）
        <input
          ref={fileInputRef}
          type="file"
          name="photos"
          multiple
          accept="image/*"
          className="mt-1 w-full rounded-lg border border-dashed border-zinc-300 px-3 py-2"
          required
        />
        <span className="mt-2 block text-xs text-zinc-400">
          できるだけイベントを選択して、写真の文脈を残してください。
        </span>
      </label>

      {error ? (
        <p className="text-sm text-red-600 md:col-span-2" role="alert">
          {error}
        </p>
      ) : null}

      <div className="md:col-span-2 flex justify-end">
        <button
          type="submit"
          disabled={isSubmitting}
          className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700 disabled:cursor-not-allowed disabled:bg-sky-300"
        >
          {isSubmitting ? "保存中..." : "保存する"}
        </button>
      </div>
    </form>
  );
}
