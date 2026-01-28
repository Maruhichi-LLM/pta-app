import Link from "next/link";
import { GroupAvatar } from "@/components/group-avatar";

type Props = {
  groupName: string;
  memberName: string;
  memberRoleLabel: string;
  groupLogoUrl?: string | null;
  children: React.ReactNode;
};

const dateFormatter = new Intl.DateTimeFormat("ja-JP", {
  dateStyle: "full",
});

export function DashboardLayout({
  groupName,
  memberName,
  memberRoleLabel,
  groupLogoUrl,
  children,
}: Props) {
  return (
    <div className="min-h-screen py-8">
      <div className="page-shell space-y-6">
        <header className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-center gap-4">
              <GroupAvatar
                name={groupName}
                logoUrl={groupLogoUrl}
                sizeClassName="h-12 w-12"
              />
              <div>
                <p className="text-xs uppercase tracking-wide text-zinc-500">
                  団体トップ
                </p>
                <h1 className="mt-1 text-3xl font-semibold text-zinc-900">
                  {groupName}
                </h1>
                <p className="mt-2 text-sm text-zinc-600">
                  {dateFormatter.format(new Date())}・{memberName}（{memberRoleLabel}
                  ）
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Link
                href="/"
                className="rounded-full border border-zinc-200 px-4 py-2 text-sm font-semibold text-zinc-700 transition hover:border-sky-200 hover:text-sky-700"
              >
                アプリ一覧
              </Link>
            </div>
          </div>
        </header>
        {children}
      </div>
    </div>
  );
}
