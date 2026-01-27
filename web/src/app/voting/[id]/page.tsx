import { redirect } from "next/navigation";
import { getSessionFromCookies } from "@/lib/session";
import { ensureModuleEnabled } from "@/lib/modules";
import { VotingCard } from "@/components/voting-card";

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function VotingDetailPage({ params }: PageProps) {
  const session = await getSessionFromCookies();
  if (!session) {
    redirect("/join");
  }
  await ensureModuleEnabled(session.groupId, "voting");

  const resolved = await params;
  const votingId = Number(resolved.id);
  if (!Number.isInteger(votingId)) {
    redirect("/voting");
  }

  return (
    <div className="min-h-screen py-10">
      <div className="page-shell space-y-8">
        <header className="rounded-2xl border border-zinc-200 bg-white/80 p-6 shadow-sm backdrop-blur">
          <p className="text-sm uppercase tracking-wide text-zinc-500">
            Knot Voting
          </p>
          <h1 className="mt-1 text-3xl font-semibold text-zinc-900">
            投票の詳細
          </h1>
          <p className="mt-2 text-sm text-zinc-600">
            チャット内の投票カードが主導線です。必要に応じてこちらでも確認できます。
          </p>
        </header>
        <VotingCard votingId={votingId} showChatConvert />
      </div>
    </div>
  );
}
