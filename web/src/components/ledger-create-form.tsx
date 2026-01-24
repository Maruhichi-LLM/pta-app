"use client";

import { ChangeEvent, FormEvent, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type AccountOption = {
  id: number;
  name: string;
  type: string;
};

type Props = {
  accounts: AccountOption[];
};

export function LedgerCreateForm({ accounts }: Props) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [transactionDate, setTransactionDate] = useState(
    new Date().toISOString().slice(0, 10)
  );
  const [amount, setAmount] = useState("");
  const [receiptUrl, setReceiptUrl] = useState("");
  const [notes, setNotes] = useState("");
  const [accountId, setAccountId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [receiptFileName, setReceiptFileName] = useState("");
  const [isUploadingReceipt, setIsUploadingReceipt] = useState(false);
  const [receiptUploadError, setReceiptUploadError] = useState<string | null>(null);
  const receiptFileInputRef = useRef<HTMLInputElement | null>(null);
  const hasAccounts = accounts.length > 0;
  const [showConfirmModal, setShowConfirmModal] = useState(false);

  // 桁区切り用の関数
  const formatNumber = (value: string): string => {
    const numericValue = value.replace(/[^\d]/g, "");
    if (!numericValue) return "";
    return Number(numericValue).toLocaleString("ja-JP");
  };

  const handleAmountChange = (e: ChangeEvent<HTMLInputElement>) => {
    const input = e.target.value;
    const numericValue = input.replace(/[^\d]/g, "");
    setAmount(numericValue);
  };

  // 確認画面を表示
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (!hasAccounts || !accountId) {
      setError("勘定科目を選択してください。");
      return;
    }
    if (!transactionDate) {
      setError("日付を入力してください。");
      return;
    }
    if (!amount) {
      setError("金額を入力してください。");
      return;
    }
    setShowConfirmModal(true);
  }

  // 実際の登録処理
  async function handleConfirmedSubmit() {
    setIsSubmitting(true);
    setError(null);
    setShowConfirmModal(false);
    try {
      const response = await fetch("/api/ledger", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          amount: Number(amount),
          receiptUrl,
          notes,
          accountId: Number(accountId),
          transactionDate,
        }),
      });
      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as {
          error?: string;
        };
        setError(data.error ?? "登録に失敗しました。");
        return;
      }
      setTitle("");
      setAmount("");
      setTransactionDate(new Date().toISOString().slice(0, 10));
      setReceiptUrl("");
      setReceiptFileName("");
      setNotes("");
      setAccountId("");
      router.refresh();
    } catch {
      setError("通信エラーが発生しました。");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleReceiptFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    setIsUploadingReceipt(true);
    setReceiptUploadError(null);
    try {
      const uploadForm = new FormData();
      uploadForm.append("file", file);
      const response = await fetch("/api/receipts", {
        method: "POST",
        body: uploadForm,
      });
      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(data.error ?? "アップロードに失敗しました。");
      }
      const data = (await response.json()) as { url: string; fileName: string };
      setReceiptUrl(data.url);
      setReceiptFileName(file.name);
    } catch (err) {
      setReceiptUploadError(
        err instanceof Error ? err.message : "アップロードに失敗しました。"
      );
    } finally {
      event.target.value = "";
      setIsUploadingReceipt(false);
    }
  }

  // 選択された勘定科目の名前を取得
  const selectedAccount = accounts.find((acc) => acc.id === Number(accountId));
  const selectedAccountName = selectedAccount?.name ?? "";

  return (
    <>
      <form
        onSubmit={handleSubmit}
        className="rounded-2xl border border-zinc-200 p-6 shadow-sm"
      >
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="text-sm text-zinc-600">
          日付
          <input
            type="date"
            value={transactionDate}
            onChange={(e) => setTransactionDate(e.target.value)}
            required
            className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
          />
        </label>
        <label className="text-sm text-zinc-600">
          勘定科目
          <select
            value={accountId}
            onChange={(e) => setAccountId(e.target.value)}
            disabled={!hasAccounts}
            required
            className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500 disabled:bg-zinc-100"
          >
            <option value="">選択してください</option>
            {accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm text-zinc-600">
          内容
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
            placeholder="例: 備品購入"
            required
          />
        </label>
        <label className="text-sm text-zinc-600">
          金額（円）
          <input
            type="text"
            inputMode="numeric"
            pattern="[0-9,]*"
            value={formatNumber(amount)}
            onChange={handleAmountChange}
            className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
            placeholder="12,000"
            required
            lang="en"
          />
        </label>
      </div>
      <label className="mt-4 block text-sm text-zinc-600">
        証憑URL（任意）
        <input
          value={receiptUrl}
          onChange={(e) => setReceiptUrl(e.target.value)}
          className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
          placeholder="https://example.com/receipt"
        />
      </label>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-zinc-600">
        <input
          ref={receiptFileInputRef}
          type="file"
          className="hidden"
          onChange={handleReceiptFileChange}
        />
        <button
          type="button"
          onClick={() => receiptFileInputRef.current?.click()}
          className="rounded-full border border-zinc-300 px-3 py-1 text-sm font-semibold text-zinc-700 transition hover:border-sky-500 hover:text-sky-600"
          disabled={isUploadingReceipt}
        >
          {isUploadingReceipt ? "アップロード中…" : "ローカルファイルを添付"}
        </button>
        {receiptFileName && !isUploadingReceipt ? (
          <span className="text-xs text-zinc-500">
            {receiptFileName} をアップロードしました
          </span>
        ) : null}
      </div>
      {receiptUploadError ? (
        <p className="mt-1 text-xs text-red-500">{receiptUploadError}</p>
      ) : null}
      <label className="mt-4 block text-sm text-zinc-600">
        メモ
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
          rows={3}
        />
      </label>
      {error ? (
        <p className="mt-4 text-sm text-red-600" role="alert">
          {error}
        </p>
      ) : null}
      {!hasAccounts ? (
        <p className="mt-4 text-sm text-amber-600">
          勘定科目が登録されていません。管理者に科目の追加を依頼してください。
        </p>
      ) : null}
      <button
        type="submit"
        disabled={isSubmitting || !hasAccounts}
        className="mt-4 w-full rounded-lg bg-sky-600 py-2 text-white transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:bg-sky-300"
      >
        {isSubmitting ? "登録中..." : "登録する"}
      </button>
    </form>

      {/* 確認モーダル */}
      {showConfirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="max-w-lg w-full rounded-2xl border border-zinc-200 bg-white p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-zinc-900">
              入出金内容の確認
            </h3>
            <p className="mt-2 text-sm text-zinc-600">
              以下の内容で登録します。よろしいですか？
            </p>

            <dl className="mt-4 space-y-3 rounded-xl border border-zinc-200 bg-zinc-50 p-4">
              <div className="flex justify-between text-sm">
                <dt className="text-zinc-500">日付</dt>
                <dd className="font-semibold text-zinc-900">{transactionDate}</dd>
              </div>
              <div className="flex justify-between text-sm">
                <dt className="text-zinc-500">勘定科目</dt>
                <dd className="font-semibold text-zinc-900">{selectedAccountName}</dd>
              </div>
              <div className="flex justify-between text-sm">
                <dt className="text-zinc-500">内容</dt>
                <dd className="font-semibold text-zinc-900">{title || "（未入力）"}</dd>
              </div>
              <div className="flex justify-between text-sm">
                <dt className="text-zinc-500">金額</dt>
                <dd className="font-semibold text-zinc-900">{formatNumber(amount)}円</dd>
              </div>
              {receiptUrl && (
                <div className="flex justify-between text-sm">
                  <dt className="text-zinc-500">証憑URL</dt>
                  <dd className="text-xs text-sky-600 break-all">{receiptUrl}</dd>
                </div>
              )}
              {notes && (
                <div className="text-sm">
                  <dt className="text-zinc-500">メモ</dt>
                  <dd className="mt-1 text-zinc-900 whitespace-pre-wrap">{notes}</dd>
                </div>
              )}
            </dl>

            <div className="mt-6 flex gap-3">
              <button
                type="button"
                onClick={() => setShowConfirmModal(false)}
                className="flex-1 rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-50"
              >
                キャンセル
              </button>
              <button
                type="button"
                onClick={handleConfirmedSubmit}
                disabled={isSubmitting}
                className="flex-1 rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:bg-sky-300"
              >
                {isSubmitting ? "登録中..." : "確定して登録"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
