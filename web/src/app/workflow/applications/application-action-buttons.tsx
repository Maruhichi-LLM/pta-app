"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

type Props = {
  applicationId: number;
};

export function ApplicationActionButtons({ applicationId }: Props) {
  const router = useRouter();
  const [comment, setComment] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState<"approve" | "reject" | null>(null);

  async function handleAction(action: "approve" | "reject") {
    setSubmitting(action);
    setError(null);
    try {
      const response = await fetch(`/api/workflow/applications/${applicationId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          comment: comment.trim() || undefined,
        }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.error ?? "処理に失敗しました。");
      }
      setComment("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "処理に失敗しました。");
    } finally {
      setSubmitting(null);
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3 rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
      <label className="text-sm text-zinc-600">
        コメント（任意）
        <textarea
          value={comment}
          onChange={(event) => setComment(event.target.value)}
          rows={2}
          className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
          placeholder="申請内容を確認しました。期日内に実施してください。"
        />
      </label>
      {error ? (
        <p className="text-sm text-rose-600" role="alert">
          {error}
        </p>
      ) : null}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => handleAction("approve")}
          disabled={submitting !== null}
          className="flex-1 rounded-full bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-emerald-300"
        >
          {submitting === "approve" ? "承認中..." : "承認"}
        </button>
        <button
          type="button"
          onClick={() => handleAction("reject")}
          disabled={submitting !== null}
          className="flex-1 rounded-full bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-700 disabled:cursor-not-allowed disabled:bg-rose-300"
        >
          {submitting === "reject" ? "却下中..." : "却下"}
        </button>
      </div>
    </form>
  );
}
