import Link from "next/link";
import { requirePlatformAdmin } from "@/lib/admin";

export default async function AdminLandingPage() {
  await requirePlatformAdmin();

  return (
    <div className="min-h-screen bg-white py-16">
      <div className="page-shell flex justify-center">
        <div className="w-full max-w-3xl rounded-2xl border border-zinc-200 bg-zinc-50 p-12 text-center shadow-sm">
          <p className="text-sm uppercase tracking-wide text-zinc-500">
            Knot Admin
          </p>
        <h1 className="mt-2 text-4xl font-semibold text-zinc-900">
          Knot プラットフォーム管理
        </h1>
        <p className="mt-4 text-sm text-zinc-600">
          団体やモジュールのステータスを一望できる管理画面です。
        </p>
          <div className="mt-10 flex justify-center">
            <Link
              href="/admin/groups"
              className="inline-flex rounded-full bg-sky-600 px-8 py-2 text-sm font-semibold text-white transition hover:bg-sky-700"
            >
              Groups を確認する
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
