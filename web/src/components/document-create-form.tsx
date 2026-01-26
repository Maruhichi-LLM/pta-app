"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

type Props = {
  isAdmin: boolean;
  adminGroups?: Array<{ id: number; name: string }>;
  defaultGroupId: number;
  currentYear: number;
};

const CATEGORY_LABELS = {
  POLICY: "規程・方針",
  REPORT: "報告書",
  FINANCE: "会計関連",
  MEETING_NOTE: "議事録 / メモ",
  OTHER: "その他",
};

export function DocumentCreateForm({ isAdmin, adminGroups = [], defaultGroupId, currentYear }: Props) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      const formData = new FormData(event.currentTarget);
      const response = await fetch("/api/documents", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as {
          error?: string;
        };
        setError(data.error ?? "アップロードに失敗しました。");
        return;
      }

      const data = (await response.json()) as { success: boolean; documentId: number };

      // アップロード成功後、一覧ページに戻ってリフレッシュ
      router.push("/documents");
      router.refresh();
    } catch {
      setError("通信エラーが発生しました。");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="mt-4 grid gap-4 md:grid-cols-2"
    >
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
        タイトル
        <input
          name="title"
          className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
          required
        />
      </label>
      <label className="text-sm text-zinc-600">
        種別
        <select
          name="category"
          className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
        >
          {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <label className="text-sm text-zinc-600">
        年度
        <input
          type="number"
          name="fiscalYear"
          defaultValue={currentYear}
          className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
          required
        />
      </label>
      <label className="text-sm text-zinc-600">
        関連イベントID（任意）
        <input
          type="number"
          name="eventId"
          className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
        />
      </label>
      <label className="text-sm text-zinc-600 md:col-span-2">
        ファイル（20MBまで）
        <input
          type="file"
          name="file"
          className="mt-1 w-full rounded-lg border border-dashed border-zinc-300 px-3 py-2"
          required
        />
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
          {isSubmitting ? "アップロード中..." : "アップロード"}
        </button>
      </div>
    </form>
  );
}
