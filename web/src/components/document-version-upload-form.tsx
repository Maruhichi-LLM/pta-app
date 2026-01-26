"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

type Props = {
  documentId: number;
};

export function DocumentVersionUploadForm({ documentId }: Props) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      const formData = new FormData(event.currentTarget);
      const response = await fetch(`/api/documents/${documentId}`, {
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

      // 成功したらページをリフレッシュ
      router.refresh();
      // フォームをリセット
      event.currentTarget.reset();
    } catch {
      setError("通信エラーが発生しました。");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="mt-4 space-y-3"
    >
      <label className="block text-sm text-zinc-600">
        ファイル（20MBまで）
        <input
          type="file"
          name="file"
          className="mt-1 w-full rounded-lg border border-dashed border-zinc-300 px-3 py-2"
          required
        />
      </label>
      {error ? (
        <p className="text-sm text-red-600" role="alert">
          {error}
        </p>
      ) : null}
      <div className="flex justify-end">
        <button
          type="submit"
          disabled={isSubmitting}
          className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700 disabled:cursor-not-allowed disabled:bg-sky-300"
        >
          {isSubmitting ? "アップロード中..." : "版を追加する"}
        </button>
      </div>
    </form>
  );
}
