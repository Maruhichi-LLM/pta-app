import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requirePlatformAdmin } from "@/lib/admin";
import {
  MODULE_LINKS,
  ModuleKey,
  resolveModules,
} from "@/lib/modules";
import { CopyButton } from "@/components/copy-button";

type GroupCard = {
  id: number;
  name: string;
  enabledModules: string[];
  createdAt: Date;
  _count: {
    members: number;
  };
};

function formatTimestamp(value: Date) {
  return value.toLocaleString("ja-JP", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function renderModuleBadge(key: ModuleKey, enabledModules: string[]) {
  const isEnabled = enabledModules.includes(key);
  return (
    <span
      key={key}
      className={`rounded-full px-2 py-1 text-xs font-semibold ${
        isEnabled
          ? "bg-sky-100 text-sky-700"
          : "bg-zinc-100 text-zinc-400 line-through"
      }`}
    >
      {key}
    </span>
  );
}

export default async function AdminGroupsPage() {
  await requirePlatformAdmin();
  const groups = (await prisma.group.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      _count: {
        select: { members: true },
      },
    },
  })) as GroupCard[];

  return (
    <div className="min-h-screen bg-white py-10">
      <div className="page-shell">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-wide text-zinc-500">
              Knot Admin
            </p>
            <h1 className="text-3xl font-semibold text-zinc-900">Groups</h1>
          </div>
          <Link
            href="/admin"
            className="rounded-full border border-zinc-200 px-4 py-2 text-sm text-zinc-600 hover:bg-zinc-50"
          >
            Admin Home
          </Link>
        </div>

        <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
          <table className="min-w-full divide-y divide-zinc-100 text-sm">
            <thead className="bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500">
              <tr>
                <th className="px-4 py-3 text-left">団体名</th>
                <th className="px-4 py-3 text-left">ID</th>
                <th className="px-4 py-3 text-left">Modules</th>
                <th className="px-4 py-3 text-right">Members</th>
                <th className="px-4 py-3 text-left">Created</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 text-zinc-800">
              {groups.map((group) => {
                const modules = resolveModules(group.enabledModules);
                return (
                  <tr key={group.id}>
                    <td className="px-4 py-3 font-semibold">{group.name}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs text-zinc-500">
                          #{group.id}
                        </span>
                        <CopyButton text={String(group.id)} />
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-2">
                        {MODULE_LINKS.map((module) =>
                          renderModuleBadge(module.key, modules)
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {group._count.members}
                    </td>
                    <td className="px-4 py-3 text-sm text-zinc-500">
                      {formatTimestamp(group.createdAt)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/admin/groups/${group.id}`}
                        className="inline-flex rounded-full border border-zinc-200 px-3 py-1.5 text-xs font-semibold text-zinc-700 hover:border-sky-500 hover:text-sky-600"
                      >
                        詳細
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
