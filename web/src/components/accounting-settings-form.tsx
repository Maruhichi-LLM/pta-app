"use client";

import { FormEvent, useState } from "react";

type Props = {
  fiscalYearOptions: number[];
  currentFiscalYear: number;
  startMonth: number;
  endMonth: number;
  carryoverAmount: number;
  approvalFlow: string;
  action: (formData: FormData) => Promise<void>;
};

export function AccountingSettingsForm({
  fiscalYearOptions,
  currentFiscalYear,
  startMonth,
  endMonth,
  carryoverAmount,
  approvalFlow,
  action,
}: Props) {
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formValues, setFormValues] = useState({
    displayFiscalYear: currentFiscalYear,
    startMonth,
    endMonth,
    carryoverAmount,
    approvalFlow,
  });


  const MONTH_VALUES = Array.from({ length: 12 }, (_, index) => index + 1);

  const formatNumber = (value: number): string => {
    return value.toLocaleString("ja-JP");
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);

    setFormValues({
      displayFiscalYear: Number(formData.get("displayFiscalYear")),
      startMonth: Number(formData.get("startMonth")),
      endMonth: Number(formData.get("endMonth")),
      carryoverAmount: Number(formData.get("carryoverAmount")),
      approvalFlow: (formData.get("approvalFlow") as string) || "",
    });

    setShowConfirmModal(true);
  };

  const handleConfirmedSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);
    setShowConfirmModal(false);

    const formData = new FormData(event.currentTarget);
    try {
      await action(formData);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <form onSubmit={handleSubmit} className="space-y-4">
        <input type="hidden" name="currentFiscalYear" value={currentFiscalYear} />
        <label className="block text-sm text-zinc-600">
          表示する年度
          <select
            name="displayFiscalYear"
            defaultValue={currentFiscalYear}
            className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
          >
            {fiscalYearOptions.map((year) => (
              <option key={year} value={year}>
                {year}年度
              </option>
            ))}
          </select>
        </label>
        <div className="space-y-4">
          <label className="block text-sm text-zinc-600">
            期首
            <select
              name="startMonth"
              defaultValue={startMonth}
              className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
            >
              {MONTH_VALUES.map((month) => (
                <option key={month} value={month}>
                  {month}月
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm text-zinc-600">
            期末
            <select
              name="endMonth"
              defaultValue={endMonth}
              className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
            >
              {MONTH_VALUES.map((month) => (
                <option key={month} value={month}>
                  {month}月
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm text-zinc-600">
            前期繰越金（円）
            <input
              type="number"
              name="carryoverAmount"
              defaultValue={carryoverAmount}
              className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
            />
          </label>
        </div>
        <label className="block text-sm text-zinc-600">
          承認フローのメモ
          <textarea
            name="approvalFlow"
            defaultValue={approvalFlow}
            rows={3}
            className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
          />
        </label>
        <div className="flex justify-end">
          <button
            type="submit"
            disabled={isSubmitting}
            className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:bg-sky-300"
          >
            {isSubmitting ? "保存中..." : "設定を保存"}
          </button>
        </div>
      </form>

      {/* 確認モーダル */}
      {showConfirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="max-w-lg w-full rounded-2xl border border-zinc-200 bg-white p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-zinc-900">
              会計年度設定の確認
            </h3>
            <p className="mt-2 text-sm text-zinc-600">
              以下の内容で保存します。よろしいですか？
            </p>

            <dl className="mt-4 space-y-3 rounded-xl border border-zinc-200 bg-zinc-50 p-4">
              <div className="flex justify-between text-sm">
                <dt className="text-zinc-500">対象年度</dt>
                <dd className="font-semibold text-zinc-900">{formValues.displayFiscalYear}年度</dd>
              </div>
              <div className="flex justify-between text-sm">
                <dt className="text-zinc-500">期首</dt>
                <dd className="font-semibold text-zinc-900">{formValues.startMonth}月</dd>
              </div>
              <div className="flex justify-between text-sm">
                <dt className="text-zinc-500">期末</dt>
                <dd className="font-semibold text-zinc-900">{formValues.endMonth}月</dd>
              </div>
              <div className="flex justify-between text-sm">
                <dt className="text-zinc-500">前期繰越金</dt>
                <dd className="font-semibold text-zinc-900">{formatNumber(formValues.carryoverAmount)}円</dd>
              </div>
              {formValues.approvalFlow && (
                <div className="text-sm">
                  <dt className="text-zinc-500">承認フローのメモ</dt>
                  <dd className="mt-1 text-zinc-900 whitespace-pre-wrap">{formValues.approvalFlow}</dd>
                </div>
              )}
            </dl>

            <form onSubmit={handleConfirmedSubmit}>
              <input type="hidden" name="currentFiscalYear" value={currentFiscalYear} />
              <input type="hidden" name="displayFiscalYear" value={formValues.displayFiscalYear} />
              <input type="hidden" name="startMonth" value={formValues.startMonth} />
              <input type="hidden" name="endMonth" value={formValues.endMonth} />
              <input type="hidden" name="carryoverAmount" value={formValues.carryoverAmount} />
              <input type="hidden" name="approvalFlow" value={formValues.approvalFlow} />

              <div className="mt-6 flex gap-3">
                <button
                  type="button"
                  onClick={() => setShowConfirmModal(false)}
                  className="flex-1 rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-50"
                >
                  キャンセル
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex-1 rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:bg-sky-300"
                >
                  {isSubmitting ? "保存中..." : "確定して保存"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
