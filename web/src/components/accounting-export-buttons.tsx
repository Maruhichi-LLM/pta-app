"use client";

import { useState } from "react";

type AccountingExportButtonsProps = {
  fiscalYearStartMonth: number;
  fiscalYearEndMonth: number;
  currentYear: number;
};

export function AccountingExportButtons({
  fiscalYearStartMonth,
  fiscalYearEndMonth,
  currentYear,
}: AccountingExportButtonsProps) {
  const [selectedYear, setSelectedYear] = useState(currentYear);

  const handleCSVDownload = () => {
    window.location.href = `/api/accounting-exports/csv?fiscalYear=${selectedYear}`;
  };

  const handlePDFDownload = () => {
    window.location.href = `/api/accounting-exports/pdf?fiscalYear=${selectedYear}`;
  };

  return (
    <>
      <div className="mt-4">
        <label className="block text-sm font-medium text-zinc-700">
          会計年度
        </label>
        <select
          value={selectedYear}
          onChange={(e) => setSelectedYear(Number(e.target.value))}
          className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
        >
          {Array.from({ length: 5 }, (_, i) => currentYear - i).map((year) => (
            <option key={year} value={year}>
              {year}年度（{year}年{fiscalYearStartMonth}月〜
              {fiscalYearEndMonth < fiscalYearStartMonth ? year + 1 : year}年
              {fiscalYearEndMonth}月）
            </option>
          ))}
        </select>
      </div>

      <div className="mt-4 flex flex-wrap gap-3">
        <button
          onClick={handleCSVDownload}
          className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700"
        >
          <svg
            className="h-4 w-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
            />
          </svg>
          CSVダウンロード
        </button>
        <button
          onClick={handlePDFDownload}
          className="inline-flex items-center gap-2 rounded-lg border border-emerald-600 px-4 py-2 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-50"
        >
          <svg
            className="h-4 w-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"
            />
          </svg>
          PDFダウンロード
        </button>
      </div>

      <p className="mt-4 text-xs text-zinc-500">
        承認済みの経費データから収支計算書を生成します。
      </p>
    </>
  );
}
