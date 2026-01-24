"use client";

import { useMemo, useState, type ReactNode } from "react";

type NavigationItem = {
  id: string;
  label: string;
  description: string;
};

type SectionDefinition = {
  id: string;
  content: ReactNode;
};

type Props = {
  navigationItems: NavigationItem[];
  sections: SectionDefinition[];
  defaultSectionId: string;
  summaryCard: ReactNode;
};

export function AccountingLayout({
  navigationItems,
  sections,
  defaultSectionId,
  summaryCard,
}: Props) {
  const sectionMap = useMemo(() => {
    const map = new Map<string, ReactNode>();
    sections.forEach((section) => {
      map.set(section.id, section.content);
    });
    return map;
  }, [sections]);
  const [activeSection, setActiveSection] = useState(() => {
    if (sectionMap.has(defaultSectionId)) {
      return defaultSectionId;
    }
    return navigationItems[0]?.id ?? "";
  });

  const handleSelect = (id: string) => {
    if (!sectionMap.has(id)) return;
    setActiveSection(id);
  };

  const activeContent = sectionMap.get(activeSection) ?? null;

  return (
    <>
      <div className="flex min-w-[340px] max-w-[360px] flex-col gap-4">
        <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
          <p className="text-xs uppercase tracking-wide text-zinc-500">
            設定と一覧
          </p>
          <ul className="mt-4 space-y-3">
            {navigationItems.map((item) => {
              const isActive = item.id === activeSection;
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => handleSelect(item.id)}
                    className={`block w-full rounded-xl border px-4 py-3 text-left transition min-h-[80px] ${
                      isActive
                        ? "border-sky-600 bg-white shadow-sm"
                        : "border-zinc-200 bg-zinc-50 hover:border-sky-500 hover:bg-white"
                    }`}
                    aria-current={isActive ? "page" : undefined}
                  >
                    <p className="text-sm font-semibold text-zinc-900">
                      {item.label}
                    </p>
                    <p className="mt-0.5 text-xs text-zinc-500">
                      {item.description}
                    </p>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
        {summaryCard}
      </div>
      <div className="flex flex-col gap-8">
        {activeContent ?? (
          <section className="rounded-2xl border border-dashed border-zinc-200 bg-white/80 p-6 text-sm text-zinc-600">
            表示できるコンテンツが見つかりません。左メニューから別の項目を選択してください。
          </section>
        )}
      </div>
    </>
  );
}
