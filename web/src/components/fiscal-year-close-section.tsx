"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type StatementItem = {
  accountId: number;
  accountName: string;
  amount: number;
};

type Statement = {
  revenue: StatementItem[];
  expense: StatementItem[];
  totalRevenue: number;
  totalExpense: number;
  balance: number;
  previousCarryover: number;
  nextCarryover: number;
};

type FiscalYearClose = {
  id: number;
  fiscalYear: number;
  startDate: string;
  endDate: string;
  status: "DRAFT" | "CONFIRMED";
  totalRevenue: number;
  totalExpense: number;
  balance: number;
  previousCarryover: number;
  nextCarryover: number;
  statement: Statement | null;
  confirmedAt: string | null;
  confirmedBy: {
    id: number;
    displayName: string;
  } | null;
};

type Props = {
  groupId: number;
  fiscalYear: number;
  fiscalYearStartMonth: number;
  fiscalYearEndMonth: number;
  existingClose?: FiscalYearClose;
  carryoverAmount: number;
};

export function FiscalYearCloseSection({
  groupId,
  fiscalYear,
  fiscalYearStartMonth,
  fiscalYearEndMonth,
  existingClose,
  carryoverAmount,
}: Props) {
  const router = useRouter();
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fiscalYearClose, setFiscalYearClose] = useState<FiscalYearClose | undefined>(existingClose);

  const numberFormatter = new Intl.NumberFormat("ja-JP");

  // 会計年度の開始日と終了日を計算
  const startDate = new Date(fiscalYear, fiscalYearStartMonth - 1, 1);
  const endDate = new Date(fiscalYear + 1, fiscalYearEndMonth, 0); // 月末

  // ローカル日時をそのまま文字列にする（UTC変換を避ける）
  const formatDateString = (date: Date) => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  };

  const startDateString = formatDateString(startDate);
  const endDateString = formatDateString(endDate);

  async function handleCreateDraft() {
    setError(null);
    setIsProcessing(true);
    try {
      const response = await fetch("/api/accounting/fiscal-year-close", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fiscalYear,
          startDate: startDateString,
          endDate: endDateString,
          previousCarryover: carryoverAmount,
          action: "create",
        }),
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as { error?: string };
        setError(data.error ?? "年度締めの作成に失敗しました。");
        return;
      }

      const result = (await response.json()) as { fiscalYearClose: FiscalYearClose };
      setFiscalYearClose(result.fiscalYearClose);
      router.refresh();
    } catch {
      setError("通信エラーが発生しました。");
    } finally {
      setIsProcessing(false);
    }
  }

  async function handleRecalculate() {
    setError(null);
    setIsProcessing(true);
    try {
      const response = await fetch("/api/accounting/fiscal-year-close", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fiscalYear,
          startDate: startDateString,
          endDate: endDateString,
          previousCarryover: carryoverAmount,
          action: "recalculate",
        }),
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as { error?: string };
        setError(data.error ?? "再計算に失敗しました。");
        return;
      }

      const result = (await response.json()) as { fiscalYearClose: FiscalYearClose };
      setFiscalYearClose(result.fiscalYearClose);
      router.refresh();
    } catch {
      setError("通信エラーが発生しました。");
    } finally {
      setIsProcessing(false);
    }
  }

  async function handleConfirm() {
    if (!confirm("年度を確定すると、次年度の繰越金が確定され、以降の変更ができなくなります。確定しますか？")) {
      return;
    }

    setError(null);
    setIsProcessing(true);
    try {
      const response = await fetch("/api/accounting/fiscal-year-close", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fiscalYear,
          startDate: startDateString,
          endDate: endDateString,
          action: "confirm",
        }),
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as { error?: string };
        setError(data.error ?? "確定処理に失敗しました。");
        return;
      }

      const result = (await response.json()) as { fiscalYearClose: FiscalYearClose };
      setFiscalYearClose(result.fiscalYearClose);

      // 確定成功後、次年度に切り替える
      const nextFiscalYear = fiscalYear + 1;
      router.push(`/accounting?fiscalYear=${nextFiscalYear}&section=fiscal-year-close`);
    } catch {
      setError("通信エラーが発生しました。");
    } finally {
      setIsProcessing(false);
    }
  }

  const isConfirmed = fiscalYearClose?.status === "CONFIRMED";
  const statement = fiscalYearClose?.statement;

  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
      <h2 className="text-lg font-semibold text-zinc-900">年度締めと収支計算書</h2>
      <p className="mt-2 text-sm text-zinc-600">
        {fiscalYear}年度（{fiscalYearStartMonth}月〜{fiscalYearEndMonth}月）の収支を確定し、次年度への繰越金を確定します。
      </p>

      <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        <p className="font-semibold">年度締めの流れ</p>
        <ol className="mt-2 ml-4 list-decimal space-y-1 text-xs">
          <li>下書きを作成：期間内の承認済み経費をもとに収支計算書を自動生成</li>
          <li>監査・承認：団体内で内容を確認し、必要に応じて経費を追加・修正</li>
          <li>再計算：経費に変更があった場合は再計算ボタンで最新状態に更新</li>
          <li>確定：理事会や総会で承認されたら確定処理を実行（取消不可）</li>
        </ol>
      </div>

      {error ? (
        <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700" role="alert">
          {error}
        </div>
      ) : null}

      {!fiscalYearClose ? (
        <div className="mt-6">
          <p className="text-sm text-zinc-600">
            まだ{fiscalYear}年度の締め処理は開始されていません。
          </p>
          <button
            type="button"
            onClick={handleCreateDraft}
            disabled={isProcessing}
            className="mt-4 rounded-lg bg-sky-600 px-6 py-2 text-sm font-semibold text-white transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:bg-sky-300"
          >
            {isProcessing ? "作成中..." : "下書きを作成する"}
          </button>
        </div>
      ) : (
        <div className="mt-6 space-y-6">
          {/* ステータス表示 */}
          <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-wide text-zinc-500">ステータス</p>
                <p className="mt-1 text-lg font-semibold text-zinc-900">
                  {isConfirmed ? (
                    <span className="inline-flex items-center gap-2 rounded-full bg-emerald-100 px-3 py-1 text-sm text-emerald-700">
                      <span className="h-2 w-2 rounded-full bg-emerald-500"></span>
                      確定済み
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-2 rounded-full bg-amber-100 px-3 py-1 text-sm text-amber-700">
                      <span className="h-2 w-2 rounded-full bg-amber-500"></span>
                      下書き
                    </span>
                  )}
                </p>
              </div>
              {isConfirmed && fiscalYearClose.confirmedAt && fiscalYearClose.confirmedBy ? (
                <div className="text-right">
                  <p className="text-xs text-zinc-500">確定日時</p>
                  <p className="mt-1 text-sm font-semibold text-zinc-900">
                    {new Date(fiscalYearClose.confirmedAt).toLocaleDateString("ja-JP", {
                      year: "numeric",
                      month: "long",
                      day: "numeric",
                    })}
                  </p>
                  <p className="text-xs text-zinc-500">
                    確定者: {fiscalYearClose.confirmedBy.displayName}
                  </p>
                </div>
              ) : null}
            </div>
          </div>

          {/* 収支サマリー */}
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-xl border border-zinc-200 bg-white p-4">
              <p className="text-xs uppercase tracking-wide text-zinc-500">前期繰越金</p>
              <p className="mt-2 text-2xl font-semibold text-zinc-900">
                {numberFormatter.format(fiscalYearClose.previousCarryover)}円
              </p>
            </div>
            <div className="rounded-xl border border-zinc-200 bg-white p-4">
              <p className="text-xs uppercase tracking-wide text-zinc-500">当期収支差額</p>
              <p className="mt-2 text-2xl font-semibold text-zinc-900">
                {numberFormatter.format(fiscalYearClose.balance)}円
              </p>
              <p className="mt-1 text-xs text-zinc-500">
                収入 {numberFormatter.format(fiscalYearClose.totalRevenue)}円 - 支出{" "}
                {numberFormatter.format(fiscalYearClose.totalExpense)}円
              </p>
            </div>
            <div className="rounded-xl border border-sky-200 bg-sky-50 p-4">
              <p className="text-xs uppercase tracking-wide text-sky-700">次期繰越金</p>
              <p className="mt-2 text-2xl font-semibold text-sky-900">
                {numberFormatter.format(fiscalYearClose.nextCarryover)}円
              </p>
            </div>
          </div>

          {/* 収支計算書 */}
          {statement ? (
            <div className="rounded-xl border border-zinc-200">
              <div className="border-b border-zinc-200 bg-zinc-50 px-4 py-3">
                <h3 className="text-center text-sm font-semibold text-zinc-900">
                  {fiscalYear}年度　収支計算書
                </h3>
                <p className="mt-1 text-center text-xs text-zinc-600">
                  （{startDate.getFullYear()}年{fiscalYearStartMonth}月1日〜
                  {endDate.getFullYear()}年{fiscalYearEndMonth}月
                  {endDate.getDate()}日）
                </p>
              </div>

              <div className="p-4">
                {/* 収入の部 */}
                <div className="mb-6">
                  <div className="mb-2 flex items-center justify-between border-b border-zinc-300 pb-1">
                    <h4 className="text-sm font-semibold text-zinc-900">【収入の部】</h4>
                  </div>
                  <div className="rounded-lg bg-zinc-50 p-3">
                    <div className="mb-2 flex justify-between text-xs text-zinc-600">
                      <span>前期繰越金</span>
                      <span>{numberFormatter.format(statement.previousCarryover)}円</span>
                    </div>
                    {statement.revenue.map((item) => (
                      <div key={item.accountId} className="mb-2 flex justify-between text-xs text-zinc-600">
                        <span>{item.accountName}</span>
                        <span>{numberFormatter.format(item.amount)}円</span>
                      </div>
                    ))}
                    <div className="mt-3 flex justify-between border-t border-zinc-300 pt-2 text-sm font-semibold text-zinc-900">
                      <span>収入合計</span>
                      <span>
                        {numberFormatter.format(
                          statement.previousCarryover + statement.totalRevenue
                        )}
                        円
                      </span>
                    </div>
                  </div>
                </div>

                {/* 支出の部 */}
                <div className="mb-6">
                  <div className="mb-2 flex items-center justify-between border-b border-zinc-300 pb-1">
                    <h4 className="text-sm font-semibold text-zinc-900">【支出の部】</h4>
                  </div>
                  <div className="rounded-lg bg-zinc-50 p-3">
                    {statement.expense.map((item) => (
                      <div key={item.accountId} className="mb-2 flex justify-between text-xs text-zinc-600">
                        <span>{item.accountName}</span>
                        <span>{numberFormatter.format(item.amount)}円</span>
                      </div>
                    ))}
                    <div className="mt-3 flex justify-between border-t border-zinc-300 pt-2 text-sm font-semibold text-zinc-900">
                      <span>支出合計</span>
                      <span>{numberFormatter.format(statement.totalExpense)}円</span>
                    </div>
                  </div>
                </div>

                {/* 差額と繰越 */}
                <div className="rounded-lg border-2 border-sky-300 bg-sky-50 p-3">
                  <div className="mb-2 flex justify-between text-sm font-semibold text-zinc-900">
                    <span>当期収支差額</span>
                    <span>{numberFormatter.format(statement.balance)}円</span>
                  </div>
                  <div className="flex justify-between text-base font-bold text-sky-900">
                    <span>次期繰越金</span>
                    <span>{numberFormatter.format(statement.nextCarryover)}円</span>
                  </div>
                </div>
              </div>
            </div>
          ) : null}

          {/* アクションボタン */}
          {!isConfirmed ? (
            <div className="flex gap-3">
              <button
                type="button"
                onClick={handleRecalculate}
                disabled={isProcessing}
                className="rounded-lg border border-zinc-300 bg-white px-6 py-2 text-sm font-semibold text-zinc-700 transition hover:border-sky-500 hover:text-sky-600 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isProcessing ? "再計算中..." : "再計算する"}
              </button>
              <button
                type="button"
                onClick={handleConfirm}
                disabled={isProcessing}
                className="rounded-lg bg-emerald-600 px-6 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-emerald-300"
              >
                {isProcessing ? "確定中..." : "この内容で確定する"}
              </button>
            </div>
          ) : (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
              <p className="font-semibold">確定済みです</p>
              <p className="mt-1 text-xs">
                この年度は確定済みのため、変更できません。次年度の繰越金は{" "}
                {numberFormatter.format(fiscalYearClose.nextCarryover)}円 として設定されます。
              </p>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
