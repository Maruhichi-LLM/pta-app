"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { DashboardCard } from "./dashboard-card";

export function AnnouncementCreateCard() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!title.trim()) {
      setError("タイトルを入力してください。");
      return;
    }
    if (!content.trim()) {
      setError("本文を入力してください。");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/announcements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, content }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error ?? "投稿に失敗しました。");
      }
      setTitle("");
      setContent("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "投稿に失敗しました。");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <DashboardCard title="全員へのお知らせを作成">
      <form className="space-y-3" onSubmit={handleSubmit}>
        <div>
          <label className="text-xs font-semibold text-zinc-600">
            タイトル
          </label>
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            className="mt-1 w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm"
            placeholder="例：活動再開のご案内"
          />
        </div>
        <div>
          <label className="text-xs font-semibold text-zinc-600">本文</label>
          <textarea
            value={content}
            onChange={(event) => setContent(event.target.value)}
            rows={4}
            className="mt-1 w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm"
            placeholder="例：来月から通常活動に戻します。集合時間の再確認をお願いします。"
          />
        </div>
        {error ? (
          <p className="text-xs font-semibold text-rose-600">{error}</p>
        ) : null}
        <div className="flex items-center justify-between gap-3 text-xs text-zinc-500">
          <span>投稿すると全員の団体トップに表示されます。</span>
          <button
            type="submit"
            disabled={submitting}
            className="rounded-full bg-zinc-900 px-4 py-2 text-xs font-semibold text-white disabled:opacity-60"
          >
            {submitting ? "投稿中..." : "お知らせを投稿"}
          </button>
        </div>
      </form>
    </DashboardCard>
  );
}
