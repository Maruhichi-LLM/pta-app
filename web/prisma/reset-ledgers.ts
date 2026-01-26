import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("既存のLedgerデータを削除します...");

  // グループIDを取得
  const group = await prisma.group.findFirst();
  if (!group) {
    throw new Error("グループが見つかりません。");
  }
  console.log(`グループ: ${group.name} (ID: ${group.id})`);

  // 既存のLedgerとApprovalを削除
  const deletedApprovals = await prisma.approval.deleteMany({
    where: {
      ledger: {
        groupId: group.id,
      },
    },
  });
  console.log(`✓ Approval ${deletedApprovals.count}件を削除しました。`);

  const deletedLedgers = await prisma.ledger.deleteMany({
    where: { groupId: group.id },
  });
  console.log(`✓ Ledger ${deletedLedgers.count}件を削除しました。`);

  // FiscalYearCloseも削除（あれば）
  const deletedFiscalYearCloses = await prisma.fiscalYearClose.deleteMany({
    where: { groupId: group.id },
  });
  console.log(`✓ FiscalYearClose ${deletedFiscalYearCloses.count}件を削除しました。`);

  console.log("\n✅ リセット完了！シードを実行してください。");
}

main()
  .catch((e) => {
    console.error("エラーが発生しました:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
