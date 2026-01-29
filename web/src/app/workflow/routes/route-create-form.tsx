"use client";

import { DragEvent, FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ROLE_ADMIN,
  ROLE_ACCOUNTANT,
  ROLE_AUDITOR,
  ROLE_MEMBER,
} from "@/lib/roles";

type ConditionBuilder = {
  minAmount: string;
  maxAmount: string;
};

type StepDraft = {
  approverRole: string;
  requireAll: boolean;
  conditions?: string;
  conditionBuilder?: ConditionBuilder;
};

const DEFAULT_CONDITION_BUILDER: ConditionBuilder = {
  minAmount: "",
  maxAmount: "",
};

const ROLE_OPTIONS = [
  ROLE_ADMIN,
  ROLE_ACCOUNTANT,
  ROLE_AUDITOR,
  ROLE_MEMBER,
] as const;

const ROLE_LABELS: Record<string, string> = {
  [ROLE_ADMIN]: "管理者",
  [ROLE_ACCOUNTANT]: "会計担当",
  [ROLE_AUDITOR]: "監査役",
  [ROLE_MEMBER]: "メンバー",
};

type DragPayload =
  | { type: "role"; role: string }
  | { type: "condition"; kind: "amount" }
  | { type: "step"; index: number };

type SampleStep = {
  approverRole: string;
  requireAll: boolean;
  conditionBuilder?: ConditionBuilder;
};

type SampleRoute = {
  label: string;
  description: string;
  steps: SampleStep[];
};

const SAMPLE_ROUTES: SampleRoute[] = [
  {
    label: "備品購入（1万円未満）",
    description: "会計担当のみで確認する少額備品フロー。",
    steps: [
      {
        approverRole: "ACCOUNTANT",
        requireAll: false,
        conditionBuilder: { minAmount: "", maxAmount: "9999" },
      },
    ],
  },
  {
    label: "備品購入（1万円以上）",
    description: "会計担当→管理者の2段階承認で高額備品を管理。",
    steps: [
      {
        approverRole: "ACCOUNTANT",
        requireAll: false,
        conditionBuilder: { minAmount: "10000", maxAmount: "" },
      },
      { approverRole: "ADMIN", requireAll: true },
    ],
  },
  {
    label: "休暇・出張申請",
    description: "管理者と監査役の2段階で確認する申請。",
    steps: [
      { approverRole: "ADMIN", requireAll: false },
      { approverRole: "AUDITOR", requireAll: false },
    ],
  },
];

export function RouteCreateForm() {
  const router = useRouter();
  const [name, setName] = useState("承認ルート");
  const [steps, setSteps] = useState<StepDraft[]>([
    {
      approverRole: "ADMIN",
      requireAll: true,
      conditionBuilder: undefined,
      conditions: "",
    },
  ]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const buildConditionsFromBuilder = (builder: ConditionBuilder) => {
    const json: Record<string, unknown> = {};
    const min = builder.minAmount.trim();
    if (min && !Number.isNaN(Number(min))) {
      json.minAmount = Number(min);
    }
    const max = builder.maxAmount.trim();
    if (max && !Number.isNaN(Number(max))) {
      json.maxAmount = Number(max);
    }
    return Object.keys(json).length > 0 ? JSON.stringify(json, null, 2) : "";
  };

  const createStep = (
    role: string,
    requireAll = true,
    conditionBuilder?: ConditionBuilder
  ): StepDraft => ({
    approverRole: role,
    requireAll,
    conditionBuilder,
    conditions: conditionBuilder
      ? buildConditionsFromBuilder(conditionBuilder)
      : "",
  });

  const applySample = (sample: (typeof SAMPLE_ROUTES)[number]) => {
    setName(sample.label);
    setSteps(
      sample.steps.map((step) => ({
        approverRole: step.approverRole,
        requireAll: step.requireAll,
        conditionBuilder: step.conditionBuilder,
        conditions: step.conditionBuilder
          ? buildConditionsFromBuilder(step.conditionBuilder)
          : "",
      }))
    );
    setError(null);
  };

  const updateStep = (index: number, patch: Partial<StepDraft>) => {
    setSteps((prev) =>
      prev.map((step, i) => (i === index ? { ...step, ...patch } : step))
    );
  };

  const removeStep = (index: number) => {
    setSteps((prev) => prev.filter((_, i) => i !== index));
  };

  const addStep = () => {
    setSteps((prev) => [...prev, createStep("MEMBER", true)]);
  };

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (steps.length === 0) {
      setError("少なくとも1つのステップを追加してください。");
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const payload = {
        name: name.trim(),
        steps: steps.map((step) => ({
          approverRole: step.approverRole.trim(),
          requireAll: step.requireAll,
          conditions:
            step.conditions && step.conditions.trim().length > 0
              ? JSON.parse(step.conditions)
              : null,
        })),
      };

      const res = await fetch("/api/workflow/routes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error ?? "作成に失敗しました");
      }
      setName("承認ルート");
      setSteps([createStep("ADMIN", true)]);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "作成に失敗しました");
    } finally {
      setSubmitting(false);
    }
  }

  const updateConditionBuilder = (
    index: number,
    patch: Partial<ConditionBuilder>
  ) => {
    setSteps((prev) =>
      prev.map((step, i) => {
        if (i !== index) return step;
        const builder = {
          ...(step.conditionBuilder ?? { ...DEFAULT_CONDITION_BUILDER }),
          ...patch,
        };
        const conditions = buildConditionsFromBuilder(builder);
        return { ...step, conditionBuilder: builder, conditions };
      })
    );
  };

  const getDragPayload = (event: DragEvent) => {
    try {
      const raw = event.dataTransfer.getData("application/json");
      if (!raw) return null;
      return JSON.parse(raw) as DragPayload;
    } catch {
      return null;
    }
  };

  const setDragPayload = (event: DragEvent, payload: DragPayload) => {
    event.dataTransfer.setData("application/json", JSON.stringify(payload));
  };

  const handleStepDragStart = (index: number, event: DragEvent) => {
    setDragPayload(event, { type: "step", index });
    event.dataTransfer.effectAllowed = "move";
  };

  const handleDropReorder = (fromIndex: number, toIndex: number) => {
    if (fromIndex === toIndex) return;
    setSteps((prev) => {
      const next = [...prev];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      return next;
    });
  };

  const handleCanvasDrop = (event: DragEvent) => {
    event.preventDefault();
    const payload = getDragPayload(event);
    if (!payload) return;
    if (payload.type === "role") {
      setSteps((prev) => [...prev, createStep(payload.role, true)]);
    }
    if (payload.type === "step") {
      handleDropReorder(payload.index, steps.length - 1);
    }
  };

  const handleStepDrop = (index: number, event: DragEvent) => {
    event.preventDefault();
    const payload = getDragPayload(event);
    if (!payload) return;
    if (payload.type === "step") {
      handleDropReorder(payload.index, index);
      return;
    }
    if (payload.type === "condition") {
      setSteps((prev) =>
        prev.map((step, i) =>
          i === index
            ? {
                ...step,
                conditionBuilder: step.conditionBuilder
                  ? step.conditionBuilder
                  : { ...DEFAULT_CONDITION_BUILDER },
              }
            : step
        )
      );
    }
    if (payload.type === "role") {
      setSteps((prev) => {
        const next = [...prev];
        next.splice(index, 0, createStep(payload.role, true));
        return next;
      });
    }
  };

  const handlePaletteDragStart =
    (payload: DragPayload) => (event: DragEvent) => {
      setDragPayload(event, payload);
      event.dataTransfer.effectAllowed =
        payload.type === "step" ? "move" : "copy";
    };

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-4 rounded-2xl border border-dashed border-zinc-300 bg-white/70 p-4"
    >
      <div className="rounded-xl border border-zinc-200 bg-white/90 p-4">
        <p className="text-sm font-semibold text-zinc-800">サンプルから始める</p>
        <p className="mt-1 text-xs text-zinc-500">
          迷ったら下のサンプルをクリックすると、ルート名とステップが自動入力されます。
        </p>
        <div className="mt-3 grid gap-3 md:grid-cols-3">
          {SAMPLE_ROUTES.map((sample) => (
            <div
              key={sample.label}
              className="flex flex-col rounded-lg border border-zinc-200 bg-white p-3 text-xs text-zinc-600"
            >
              <p className="text-sm font-semibold text-zinc-900">{sample.label}</p>
              <p className="mt-1 flex-1 leading-relaxed">{sample.description}</p>
              <button
                type="button"
                onClick={() => applySample(sample)}
                className="mt-3 rounded-full border border-sky-200 px-3 py-1 text-xs font-semibold text-sky-700 transition hover:border-sky-400 hover:text-sky-800"
              >
                このサンプルを使う
              </button>
            </div>
          ))}
        </div>
      </div>
      <div>
        <label className="text-sm font-medium text-zinc-700">ルート名</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
        />
      </div>
      <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
        <section className="rounded-2xl border border-zinc-200 bg-white/80 p-4 text-sm text-zinc-700">
          <p className="text-sm font-semibold text-zinc-800">権限パレット</p>
          <p className="mt-1 text-xs text-zinc-500">
            左からドラッグしてフロー図にドロップしてください。
          </p>
          <div className="mt-3 space-y-2">
            {ROLE_OPTIONS.map((role) => (
              <div
                key={role}
                draggable
                onDragStart={handlePaletteDragStart({ type: "role", role })}
                className="flex items-center justify-between rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm"
              >
                <span>{ROLE_LABELS[role]}</span>
                <span className="text-xs text-zinc-400">ドラッグ</span>
              </div>
            ))}
          </div>

          <div className="mt-6">
            <p className="text-sm font-semibold text-zinc-800">条件パレット</p>
            <p className="mt-1 text-xs text-zinc-500">
              条件を追加したいステップにドラッグしてください。
            </p>
            <div
              draggable
              onDragStart={handlePaletteDragStart({
                type: "condition",
                kind: "amount",
              })}
              className="mt-3 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm"
            >
              金額条件（最小/最大）
            </div>
          </div>
        </section>

        <section
          className="rounded-2xl border border-dashed border-zinc-300 bg-white/70 p-4"
          onDragOver={(event) => event.preventDefault()}
          onDrop={handleCanvasDrop}
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-zinc-800">
                承認フロー図
              </p>
              <p className="text-xs text-zinc-500">
                ステップ同士はドラッグで並び替えできます。
              </p>
            </div>
            <button
              type="button"
              onClick={addStep}
              className="rounded-full border border-zinc-200 px-3 py-1 text-xs font-semibold text-zinc-600 hover:border-sky-300 hover:text-sky-700"
            >
              ＋ 空のステップ
            </button>
          </div>

          {steps.length === 0 ? (
            <div className="mt-6 rounded-xl border border-dashed border-zinc-300 p-6 text-center text-sm text-zinc-500">
              ここに権限をドラッグしてステップを作成してください。
            </div>
          ) : (
            <div className="mt-4 space-y-3">
              {steps.map((step, index) => (
                <div key={index} className="space-y-2">
                  <div
                    className="rounded-xl border border-zinc-200 bg-white p-4 text-sm shadow-sm"
                    draggable
                    onDragStart={(event) => handleStepDragStart(index, event)}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={(event) => handleStepDrop(index, event)}
                  >
                    <div className="flex items-start gap-3">
                      <span className="mt-1 cursor-move select-none rounded-lg border border-zinc-200 bg-zinc-50 px-2 py-1 text-xs text-zinc-500">
                        ⇅
                      </span>
                      <div className="flex-1 space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-600">
                            STEP {index + 1}
                          </span>
                          <label className="flex-1">
                            <span className="text-xs text-zinc-500">権限ラベル</span>
                            <select
                              value={step.approverRole}
                              onChange={(e) =>
                                updateStep(index, { approverRole: e.target.value })
                              }
                              className="mt-1 w-full rounded-lg border border-zinc-300 px-2 py-1"
                            >
                              {ROLE_OPTIONS.map((role) => (
                                <option key={role} value={role}>
                                  {ROLE_LABELS[role]}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label className="text-xs text-zinc-500">
                            <input
                              type="checkbox"
                              checked={step.requireAll}
                              onChange={(e) =>
                                updateStep(index, { requireAll: e.target.checked })
                              }
                              className="mr-1"
                            />
                            全員承認
                          </label>
                        </div>

                        {step.conditionBuilder ? (
                          <div className="rounded-lg border border-sky-100 bg-sky-50 p-3 text-xs text-sky-900">
                            <div className="flex items-center justify-between">
                              <p className="font-semibold">金額条件</p>
                              <button
                                type="button"
                                onClick={() =>
                                  updateStep(index, {
                                    conditionBuilder: undefined,
                                    conditions: "",
                                  })
                                }
                                className="text-[11px] text-sky-700 hover:underline"
                              >
                                条件を外す
                              </button>
                            </div>
                            <div className="mt-2 grid gap-2 md:grid-cols-2">
                              <label className="block text-[11px] text-sky-700">
                                最低金額 (円)
                                <input
                                  type="number"
                                  value={step.conditionBuilder?.minAmount ?? ""}
                                  onChange={(e) =>
                                    updateConditionBuilder(index, {
                                      minAmount: e.target.value,
                                    })
                                  }
                                  className="mt-1 w-full rounded border border-sky-200 px-2 py-1 text-xs"
                                  placeholder="10000"
                                />
                              </label>
                              <label className="block text-[11px] text-sky-700">
                                最高金額 (円)
                                <input
                                  type="number"
                                  value={step.conditionBuilder?.maxAmount ?? ""}
                                  onChange={(e) =>
                                    updateConditionBuilder(index, {
                                      maxAmount: e.target.value,
                                    })
                                  }
                                  className="mt-1 w-full rounded border border-sky-200 px-2 py-1 text-xs"
                                  placeholder="50000"
                                />
                              </label>
                            </div>
                          </div>
                        ) : (
                          <div className="rounded-lg border border-dashed border-zinc-200 px-3 py-2 text-xs text-zinc-400">
                            左の「金額条件」をこのカードにドロップすると条件を追加できます。
                          </div>
                        )}
                      </div>
                    </div>
                    {steps.length > 1 ? (
                      <button
                        type="button"
                        onClick={() => removeStep(index)}
                        className="mt-3 text-xs text-rose-600 hover:underline"
                      >
                        このステップを削除
                      </button>
                    ) : null}
                    <details className="mt-3">
                      <summary className="cursor-pointer text-[11px] text-zinc-500">
                        詳細設定（JSONで編集）
                      </summary>
                      <textarea
                        value={step.conditions ?? ""}
                        onChange={(e) =>
                          updateStep(index, {
                            conditions: e.target.value,
                            conditionBuilder: undefined,
                          })
                        }
                        rows={3}
                        className="mt-2 w-full rounded-lg border border-zinc-300 px-2 py-1 text-xs"
                        placeholder='{"minAmount":10000}'
                      />
                    </details>
                  </div>
                  {index < steps.length - 1 ? (
                    <div
                      className="flex flex-col items-center justify-center py-1 text-zinc-300"
                      aria-hidden="true"
                    >
                      <div className="h-4 w-px bg-zinc-300" />
                      <div className="mt-1 h-2 w-2 rotate-45 border-b-2 border-r-2 border-zinc-300" />
                      <div className="mt-1 h-4 w-px bg-zinc-300" />
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </section>
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
          className="rounded-full bg-sky-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:bg-sky-300"
        >
          {submitting ? "作成中..." : "ルートを作成"}
        </button>
      </div>
    </form>
  );
}
