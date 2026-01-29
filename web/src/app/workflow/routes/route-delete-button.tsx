"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Props = {
  routeId: number;
};

export function RouteDeleteButton({ routeId }: Props) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);

  async function handleDelete() {
    if (submitting) return;
    const ok = window.confirm(
      "この承認ルートを削除しますか？申請で使用中の場合は削除できません。"
    );
    if (!ok) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/workflow/routes/${routeId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error ?? "削除に失敗しました。");
      }
      router.refresh();
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "削除に失敗しました。");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleDelete}
      disabled={submitting}
      className="rounded-full border border-rose-200 px-3 py-1 text-xs font-semibold text-rose-600 hover:border-rose-300 hover:text-rose-700 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {submitting ? "削除中..." : "削除"}
    </button>
  );
}
