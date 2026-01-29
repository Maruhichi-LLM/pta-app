"use client";

import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { ApprovalFieldType } from "@/lib/workflow-schema";

export type RouteOption = {
  id: number;
  name: string;
};

type FieldDraft = {
  id: string;
  label: string;
  type: ApprovalFieldType;
  required: boolean;
  optionsText?: string;
};

const FIELD_TYPE_OPTIONS: { value: ApprovalFieldType; label: string }[] = [
  { value: "text", label: "テキスト" },
  { value: "textarea", label: "長文テキスト" },
  { value: "number", label: "数値" },
  { value: "date", label: "日付" },
  { value: "select", label: "単一選択" },
  { value: "multiSelect", label: "複数選択" },
  { value: "checkbox", label: "チェック" },
  { value: "file", label: "ファイル" },
];

export function TemplateCreateForm({ routes }: { routes: RouteOption[] }) {
  const router = useRouter();
  const [name, setName] = useState("新規申請");
  const [description, setDescription] = useState("");
  const [routeId, setRouteId] = useState<number>(routes[0]?.id ?? 0);
  const [fields, setFields] = useState<FieldDraft[]>([
    {
      id: "purpose",
      label: "目的",
      type: "text",
      required: true,
    },
    {
      id: "amount",
      label: "金額",
      type: "number",
      required: true,
    },
  ]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [useAdvancedJson, setUseAdvancedJson] = useState(false);
  const [rawJson, setRawJson] = useState("{\n  \"items\": []\n}");

  const updateField = (index: number, patch: Partial<FieldDraft>) => {
    setFields((prev) =>
      prev.map((field, i) => (i === index ? { ...field, ...patch } : field))
    );
  };

  const addField = () => {
    setFields((prev) => [
      ...prev,
      {
        id: `field${prev.length + 1}`,
        label: "新しい項目",
        type: "text",
        required: false,
      },
    ]);
  };

  const removeField = (index: number) => {
    setFields((prev) => prev.filter((_, i) => i !== index));
  };

  const normalizedFields = useMemo(() => {
    return fields.map((field) => {
      const options =
        field.type === "select" || field.type === "multiSelect"
          ? (field.optionsText ?? "")
              .split("\n")
              .map((item) => item.trim())
              .filter((item) => item.length > 0)
              .map((item) => ({ label: item, value: item }))
          : undefined;
      return {
        id: field.id.trim(),
        label: field.label.trim(),
        type: field.type,
        required: field.required,
        ...(options ? { options } : {}),
      };
    });
  }, [fields]);

  if (routes.length === 0) {
    return (
      <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
        先に承認ルートを作成してください。{" "}
        <a
          href="/workflow/routes"
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
        fields: useAdvancedJson ? JSON.parse(rawJson) : { items: normalizedFields },
      };
      const res = await fetch("/api/workflow/templates", {
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
      setFields([
        {
          id: "purpose",
          label: "目的",
          type: "text",
          required: true,
        },
        {
          id: "amount",
          label: "金額",
          type: "number",
          required: true,
        },
      ]);
      setRawJson("{\n  \"items\": []\n}");
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
      <div className="rounded-2xl border border-zinc-200 bg-white p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-zinc-800">
              申請フォームの項目
            </p>
            <p className="text-xs text-zinc-500">
              項目を追加すると申請フォームにそのまま表示されます。
            </p>
          </div>
          <button
            type="button"
            onClick={addField}
            className="rounded-full border border-sky-200 px-3 py-1 text-xs font-semibold text-sky-700 hover:border-sky-400 hover:text-sky-800"
          >
            ＋ 項目を追加
          </button>
        </div>
        <div className="mt-4 space-y-3">
          {fields.map((field, index) => (
            <div
              key={`${field.id}-${index}`}
              className="rounded-xl border border-zinc-200 bg-zinc-50 p-3 text-sm"
            >
              <div className="grid gap-3 md:grid-cols-[1fr_140px_120px]">
                <label className="text-xs text-zinc-500">
                  項目名
                  <input
                    type="text"
                    value={field.label}
                    onChange={(e) =>
                      updateField(index, { label: e.target.value })
                    }
                    className="mt-1 w-full rounded-lg border border-zinc-300 px-2 py-1 text-sm"
                    placeholder="例: 目的"
                  />
                </label>
                <label className="text-xs text-zinc-500">
                  種類
                  <select
                    value={field.type}
                    onChange={(e) =>
                      updateField(index, {
                        type: e.target.value as ApprovalFieldType,
                      })
                    }
                    className="mt-1 w-full rounded-lg border border-zinc-300 px-2 py-1 text-sm"
                  >
                    {FIELD_TYPE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex items-center gap-2 text-xs text-zinc-500">
                  <input
                    type="checkbox"
                    checked={field.required}
                    onChange={(e) =>
                      updateField(index, { required: e.target.checked })
                    }
                    className="h-4 w-4 rounded border-zinc-300"
                  />
                  必須
                </label>
              </div>
              <div className="mt-3 grid gap-3 md:grid-cols-[180px_1fr]">
                <label className="text-xs text-zinc-500">
                  ID（システム用）
                  <input
                    type="text"
                    value={field.id}
                    onChange={(e) =>
                      updateField(index, { id: e.target.value })
                    }
                    className="mt-1 w-full rounded-lg border border-zinc-300 px-2 py-1 text-sm"
                    placeholder="例: purpose"
                  />
                </label>
                {(field.type === "select" || field.type === "multiSelect") && (
                  <label className="text-xs text-zinc-500">
                    選択肢（1行1項目）
                    <textarea
                      value={field.optionsText ?? ""}
                      onChange={(e) =>
                        updateField(index, { optionsText: e.target.value })
                      }
                      rows={2}
                      className="mt-1 w-full rounded-lg border border-zinc-300 px-2 py-1 text-sm"
                      placeholder={"例:\n通常\n緊急"}
                    />
                  </label>
                )}
              </div>
              <div className="mt-3 flex justify-between text-xs text-zinc-500">
                <span>申請フォームでの表示名: {field.label || "未設定"}</span>
                {fields.length > 1 ? (
                  <button
                    type="button"
                    onClick={() => removeField(index)}
                    className="text-rose-600 hover:underline"
                  >
                    削除
                  </button>
                ) : null}
              </div>
            </div>
          ))}
        </div>
        <div className="mt-4 rounded-lg border border-dashed border-zinc-200 p-3 text-xs text-zinc-500">
          ID は英数字・ハイフン・アンダースコアのみ推奨です。例: purpose, amount, request_date
        </div>
      </div>
      <details className="rounded-2xl border border-zinc-200 bg-white p-4">
        <summary className="cursor-pointer text-sm font-semibold text-zinc-700">
          上級者向け: JSONで直接編集
        </summary>
        <p className="mt-2 text-xs text-zinc-500">
          JSONで編集したい場合のみ利用してください。通常は上のフォームで十分です。
        </p>
        <label className="mt-3 block text-sm text-zinc-600">
          フィールド定義 (JSON)
          <textarea
            value={rawJson}
            onChange={(e) => {
              setRawJson(e.target.value);
              setUseAdvancedJson(true);
            }}
            rows={6}
            className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 font-mono text-xs"
            placeholder='{"items": [{"id":"purpose","label":"目的","type":"text"}]}'
          />
        </label>
        <label className="mt-2 flex items-center gap-2 text-xs text-zinc-500">
          <input
            type="checkbox"
            checked={useAdvancedJson}
            onChange={(e) => setUseAdvancedJson(e.target.checked)}
            className="h-4 w-4 rounded border-zinc-300"
          />
          JSONを優先して保存する
        </label>
      </details>
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
