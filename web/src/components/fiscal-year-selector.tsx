"use client";

import { useRouter } from "next/navigation";
import { ChangeEvent } from "react";

type Props = {
  fiscalYearOptions: number[];
  currentFiscalYear: number;
};

export function FiscalYearSelector({ fiscalYearOptions, currentFiscalYear }: Props) {
  const router = useRouter();

  const handleChange = (e: ChangeEvent<HTMLSelectElement>) => {
    const selectedYear = e.target.value;
    router.push(`/accounting?section=accounting-settings&fiscalYear=${selectedYear}`);
  };

  return (
    <select
      value={currentFiscalYear}
      onChange={handleChange}
      className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
    >
      {fiscalYearOptions.map((year) => (
        <option key={year} value={year}>
          {year}年度
        </option>
      ))}
    </select>
  );
}
