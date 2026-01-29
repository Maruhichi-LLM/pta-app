"use client";

import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ApprovalFieldDefinition,
  ApprovalFormValues,
  buildInitialValues,
  DEFAULT_APPROVAL_FORM_SCHEMA,
} from "@/lib/workflow-schema";

export type RouteOption = {
  id: number;
  name: string;
};

type Props = {
  routes: RouteOption[];
};

export function ApplicationCreateForm({ routes }: Props) {
  const router = useRouter();
  const [selectedRouteId, setSelectedRouteId] = useState<number>(
    routes[0]?.id ?? 0
  );
  const [title, setTitle] = useState("");
  const [values, setValues] = useState<ApprovalFormValues>({});
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const selectedRoute = useMemo(
    () => routes.find((route) => route.id === selectedRouteId),
    [routes, selectedRouteId]
  );

  useEffect(() => {
    if (selectedRoute) {
      setValues(buildInitialValues(DEFAULT_APPROVAL_FORM_SCHEMA));
      setTitle(
        `${selectedRoute.name} ${new Date().toLocaleDateString("ja-JP")}`
      );
    }
  }, [selectedRoute]);

  const updateValue = (fieldId: string, value: string | number | boolean | string[] | null) => {
    setValues((prev) => ({
      ...prev,
      [fieldId]: value,
    }));
  };

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedRoute) {
      setError("承認ルートを選択してください。");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch("/api/workflow/applications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          routeId: selectedRoute.id,
          title: title.trim(),
          data: values,
        }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.error ?? "申請の作成に失敗しました。");
      }
      setValues(buildInitialValues(DEFAULT_APPROVAL_FORM_SCHEMA));
      setTitle(
        `${selectedRoute.name} ${new Date().toLocaleDateString("ja-JP")}`
      );
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "申請の作成に失敗しました。");
    } finally {
      setSubmitting(false);
    }
  }

  if (routes.length === 0) {
    return (
      <p className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        利用可能な承認ルートがありません。管理者に承認ルートの作成を依頼してください。
      </p>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-5 rounded-2xl border border-dashed border-zinc-300 bg-white/70 p-5 shadow-sm"
    >
      <div className="grid gap-4 md:grid-cols-2">
        <label className="text-sm text-zinc-600">
          承認ルート
          <select
            value={selectedRouteId}
            onChange={(event) => setSelectedRouteId(Number(event.target.value))}
            className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
          >
            {routes.map((route) => (
              <option key={route.id} value={route.id}>
                {route.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm text-zinc-600">
          申請タイトル
          <input
            type="text"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
            placeholder="備品購入（4月部会向け）"
          />
        </label>
      </div>

      <div className="space-y-4">
        {DEFAULT_APPROVAL_FORM_SCHEMA.items.map((field) => (
          <FieldRenderer
            key={field.id}
            field={field}
            value={values[field.id]}
            onChange={(value) => updateValue(field.id, value)}
          />
        ))}
      </div>

      {error ? (
        <p className="text-sm text-rose-600" role="alert">
          {error}
        </p>
      ) : null}

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={submitting}
          className="rounded-full bg-sky-600 px-5 py-2 text-sm font-semibold text-white hover:bg-sky-700 disabled:cursor-not-allowed disabled:bg-sky-300"
        >
          {submitting ? "送信中..." : "申請を登録"}
        </button>
      </div>
    </form>
  );
}

function FieldRenderer({
  field,
  value,
  onChange,
}: {
  field: ApprovalFieldDefinition;
  value: string | number | boolean | string[] | null;
  onChange: (value: string | number | boolean | string[] | null) => void;
}) {
  const requiredMark = field.required ? (
    <span className="ml-1 text-rose-500">*</span>
  ) : null;
  const helper = field.helpText ? (
    <p className="mt-1 text-xs text-zinc-500">{field.helpText}</p>
  ) : null;

  switch (field.type) {
    case "file":
      return <FileUploadField field={field} value={value} onChange={onChange} />;
    case "textarea":
      return (
        <label className="block text-sm text-zinc-600">
          {field.label}
          {requiredMark}
          <textarea
            value={(value as string | null) ?? ""}
            onChange={(event) => onChange(event.target.value)}
            rows={3}
            className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
            placeholder={field.placeholder}
          />
          {helper}
        </label>
      );
    case "number":
      return (
        <label className="block text-sm text-zinc-600">
          {field.label}
          {requiredMark}
          <input
            type="number"
            value={(value as string | number | null) ?? ""}
            onChange={(event) => onChange(event.target.value)}
            min={field.min}
            max={field.max}
            className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
            placeholder={field.placeholder}
          />
          {helper}
        </label>
      );
    case "date":
      return (
        <label className="block text-sm text-zinc-600">
          {field.label}
          {requiredMark}
          <input
            type="date"
            value={(value as string | null) ?? ""}
            onChange={(event) => onChange(event.target.value)}
            className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
          />
          {helper}
        </label>
      );
    case "select":
      return (
        <label className="block text-sm text-zinc-600">
          {field.label}
          {requiredMark}
          <select
            value={(value as string | null) ?? ""}
            onChange={(event) => onChange(event.target.value)}
            className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
          >
            <option value="">選択してください</option>
            {field.options?.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          {helper}
        </label>
      );
    case "multiSelect":
      return (
        <label className="block text-sm text-zinc-600">
          {field.label}
          {requiredMark}
          <select
            multiple
            value={(value as string[] | undefined) ?? []}
            onChange={(event) =>
              onChange(
                Array.from(event.target.selectedOptions).map((option) => option.value)
              )
            }
            className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
          >
            {field.options?.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          {helper}
        </label>
      );
    case "checkbox":
      return (
        <label className="flex items-center gap-2 text-sm text-zinc-600">
          <input
            type="checkbox"
            checked={Boolean(value)}
            onChange={(event) => onChange(event.target.checked)}
            className="h-4 w-4 rounded border-zinc-300 text-sky-600 focus:ring-sky-500"
          />
          {field.label}
          {requiredMark}
          {helper}
        </label>
      );
    default:
      return (
        <label className="block text-sm text-zinc-600">
          {field.label}
          {requiredMark}
          <input
            type="text"
            value={(value as string | null) ?? ""}
            onChange={(event) => onChange(event.target.value)}
            className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
            placeholder={field.placeholder}
          />
          {helper}
        </label>
      );
  }
}

function FileUploadField({
  field,
  value,
  onChange,
}: {
  field: ApprovalFieldDefinition;
  value: string | number | boolean | string[] | null;
  onChange: (value: string | number | boolean | string[] | null) => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/receipts", {
        method: "POST",
        body: formData,
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error ?? "アップロードに失敗しました。");
      }
      const data = (await res.json()) as { url: string };
      onChange(data.url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "アップロードに失敗しました。");
    } finally {
      event.target.value = "";
      setUploading(false);
    }
  }

  return (
    <label className="block text-sm text-zinc-600">
      {field.label}
      <div className="mt-1 rounded-lg border border-zinc-300 bg-transparent px-3 py-2">
        <div className="flex flex-wrap items-center gap-3">
          <input type="file" onChange={handleFileChange} className="text-sm" />
          {uploading ? (
            <span className="text-xs text-zinc-500">アップロード中...</span>
          ) : null}
          {typeof value === "string" && value.length > 0 ? (
            <a
              href={value}
              target="_blank"
              rel="noreferrer"
              className="text-xs text-sky-600 underline"
            >
              添付ファイルを開く
            </a>
          ) : null}
          {typeof value === "string" && value.length > 0 ? (
            <button
              type="button"
              onClick={() => onChange(null)}
              className="text-xs text-rose-600 hover:underline"
            >
              解除
            </button>
          ) : null}
        </div>
      </div>
      {error ? <p className="mt-1 text-xs text-rose-600">{error}</p> : null}
    </label>
  );
}
