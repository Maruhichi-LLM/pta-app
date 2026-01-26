"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Props = {
  documentId: number;
  documentTitle: string;
};

export function DocumentDeleteButton({ documentId, documentTitle }: Props) {
  const router = useRouter();
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    setIsDeleting(true);
    setError(null);

    try {
      const response = await fetch(`/api/documents/${documentId}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as {
          error?: string;
        };
        setError(data.error ?? "削除に失敗しました。");
        return;
      }

      setShowConfirmModal(false);
      router.push("/documents");
      router.refresh();
    } catch {
      setError("通信エラーが発生しました。");
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setShowConfirmModal(true)}
        className="rounded-full border border-red-300 bg-white px-3 py-1 text-xs font-semibold text-red-600 hover:border-red-500 hover:bg-red-50"
      >
        削除
      </button>

      {showConfirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="max-w-md w-full rounded-2xl border border-zinc-200 bg-white p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-zinc-900">
              文書を削除
            </h3>
            <p className="mt-2 text-sm text-zinc-600">
              「{documentTitle}」を削除しますか？
            </p>
            <p className="mt-2 text-sm text-red-600 font-semibold">
              この操作は取り消せません。すべてのバージョンが削除されます。
            </p>

            {error ? (
              <p className="mt-4 text-sm text-red-600" role="alert">
                {error}
              </p>
            ) : null}

            <div className="mt-6 flex gap-3">
              <button
                type="button"
                onClick={() => setShowConfirmModal(false)}
                disabled={isDeleting}
                className="flex-1 rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                キャンセル
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={isDeleting}
                className="flex-1 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:bg-red-300"
              >
                {isDeleting ? "削除中..." : "削除する"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
