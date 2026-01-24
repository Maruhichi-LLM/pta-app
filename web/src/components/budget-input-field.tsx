"use client";

import { ChangeEvent, useState } from "react";

type Props = {
  accountId: number;
  defaultValue: number | undefined;
};

export function BudgetInputField({ accountId, defaultValue }: Props) {
  const [value, setValue] = useState(defaultValue?.toString() ?? "");

  // 桁区切り用の関数
  const formatNumber = (value: string): string => {
    const numericValue = value.replace(/[^\d]/g, "");
    if (!numericValue) return "";
    return Number(numericValue).toLocaleString("ja-JP");
  };

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    const input = e.target.value;
    const numericValue = input.replace(/[^\d]/g, "");
    setValue(numericValue);
  };

  return (
    <>
      {/* 表示用の入力欄（桁区切り） */}
      <input
        type="text"
        inputMode="numeric"
        pattern="[0-9,]*"
        value={formatNumber(value)}
        onChange={handleChange}
        className="w-full rounded-lg border border-zinc-300 px-3 py-2 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500 lg:max-w-[200px]"
        placeholder="0"
        lang="en"
      />
      {/* 送信用の隠しフィールド（数値のみ） */}
      <input
        type="hidden"
        name={`budget-${accountId}`}
        value={value}
      />
    </>
  );
}
