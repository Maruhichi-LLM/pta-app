"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

export type RouteOption = {
  id: number;
  name: string;
};

export function TemplateCreateForm({ routes }: { routes: RouteOption[] }) {
  const router = useRouter();
  const [name, setName] = useState("新規申請");
  const [description, setDescription] = useState("");
  const [routeId, setRouteId] = useState<number>(routes[0]?.id ?? 0);
  const [fields, setFields] = useState("{\n  \"items\": []\n}");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (routes.length === 0) {
    return (
      <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
        先に承認ルートを作成してください。{" "}
        <a
          href="/approval/routes"
          className="font-semibold text-amber-900 underline underline-offset-2"
        >
          承認ルート管理へ移動
        </a>
      </p>
    );
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const payload = {
        name: name.trim(),
        description: description.trim() || null,
        routeId,
        fields: JSON.parse(fields),
      };
      const res = await fetch("/api/approval/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error ?? "テンプレート作成に失敗しました");
      }
      setName("新規申請");
      setDescription("");
      setFields("{\n  \"items\": []\n}");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "作成に失敗しました");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-4 rounded-2xl border border-dashed border-zinc-300 bg-white/70 p-4"
    >
      <div className="grid gap-4 md:grid-cols-2">
        <label className="text-sm text-zinc-600">
          名称
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2"
          />
        </label>
        <label className="text-sm text-zinc-600">
          承認ルート
          <select
            value={routeId}
            onChange={(e) => setRouteId(Number(e.target.value))}
            className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2"
          >
            {routes.map((route) => (
              <option key={route.id} value={route.id}>
                {route.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="block text-sm text-zinc-600">
        説明 (任意)
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
        />
      </label>
      <label className="block text-sm text-zinc-600">
        フィールド定義 (JSON)
        <textarea
          value={fields}
          onChange={(e) => setFields(e.target.value)}
          rows={6}
          className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 font-mono text-xs"
          placeholder='{"items": [{"label":"目的","type":"text"}]}'
        />
      </label>
      {error ? (
        <p className="text-sm text-rose-600" role="alert">
          {error}
        </p>
      ) : null}
      <div className="flex justify-end">
        <button
          type="submit"
          disabled={submitting}
          className="rounded-full bg-sky-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:bg-sky-300"
        >
          {submitting ? "保存中..." : "テンプレートを作成"}
        </button>
      </div>
    </form>
  );
}
