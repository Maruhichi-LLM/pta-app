import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// 収入科目の摘要例
const revenueDescriptions = [
  "会費収入（4月分）",
  "会費収入（5月分）",
  "会費収入（6月分）",
  "会費収入（7月分）",
  "会費収入（8月分）",
  "会費収入（9月分）",
  "バザー売上",
  "フリーマーケット売上",
  "寄附金（個人）",
  "寄附金（法人）",
  "補助金（市）",
  "補助金（県）",
  "事業収入（講演会）",
  "事業収入（セミナー）",
  "事業収入（イベント）",
  "雑収入（書籍販売）",
  "雑収入（グッズ販売）",
  "受取利息",
];

// 支出科目の摘要例
const expenseDescriptions = [
  "事務用品購入（文房具）",
  "事務用品購入（コピー用紙）",
  "事務用品購入（封筒）",
  "印刷費（チラシ）",
  "印刷費（会報）",
  "印刷費（ポスター）",
  "郵送費（会報発送）",
  "郵送費（案内状）",
  "通信費（インターネット）",
  "通信費（電話）",
  "会場費（総会）",
  "会場費（理事会）",
  "会場費（イベント）",
  "講師謝礼（セミナー）",
  "講師謝礼（講演会）",
  "交通費（出張）",
  "交通費（会議）",
  "消耗品費（清掃用具）",
  "消耗品費（機材）",
  "水道光熱費（事務所）",
  "賃借料（事務所家賃）",
  "保険料（損害保険）",
  "委託費（会計監査）",
  "委託費（システム保守）",
  "広報費（ウェブサイト）",
  "広報費（SNS広告）",
  "備品購入（デスク）",
  "備品購入（椅子）",
  "備品購入（プロジェクター）",
  "図書費（専門書）",
];

function randomElement<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomDate(start: Date, end: Date): Date {
  return new Date(
    start.getTime() + Math.random() * (end.getTime() - start.getTime())
  );
}

async function main() {
  console.log("シードデータ作成を開始します...");

  // グループIDを取得（既存の最初のグループを使用）
  const group = await prisma.group.findFirst();
  if (!group) {
    throw new Error("グループが見つかりません。先にグループを作成してください。");
  }
  console.log(`グループ: ${group.name} (ID: ${group.id})`);

  // メンバーを取得（最初のメンバーを使用）
  const member = await prisma.member.findFirst({
    where: { groupId: group.id },
  });
  if (!member) {
    throw new Error("メンバーが見つかりません。先にメンバーを作成してください。");
  }
  console.log(`作成者: ${member.displayName} (ID: ${member.id})`);

  // 勘定科目を取得
  const accounts = await prisma.account.findMany({
    where: { groupId: group.id },
  });
  if (accounts.length === 0) {
    throw new Error("勘定科目が見つかりません。先に勘定科目を作成してください。");
  }

  const incomeAccounts = accounts.filter((a) => a.type === "INCOME");
  const expenseAccounts = accounts.filter((a) => a.type === "EXPENSE");

  console.log(`収入科目: ${incomeAccounts.length}件`);
  console.log(`支出科目: ${expenseAccounts.length}件`);

  if (incomeAccounts.length === 0 || expenseAccounts.length === 0) {
    throw new Error("収入科目または支出科目が不足しています。");
  }

  // 会計年度の期間を決定（2025年度: 2025/4/1 〜 2026/3/31）
  const fiscalYearStart = new Date(2025, 3, 1); // 2025年4月1日
  const fiscalYearEnd = new Date(2026, 2, 31, 23, 59, 59); // 2026年3月31日

  console.log(
    `会計年度: ${fiscalYearStart.toLocaleDateString("ja-JP")} 〜 ${fiscalYearEnd.toLocaleDateString("ja-JP")}`
  );

  // 既存のLedgerを削除（オプション）
  // const deletedCount = await prisma.ledger.deleteMany({
  //   where: { groupId: group.id },
  // });
  // console.log(`既存のLedger ${deletedCount.count}件を削除しました。`);

  // 100件のLedgerを作成
  const ledgerCount = 100;
  const createdLedgers = [];

  for (let i = 0; i < ledgerCount; i++) {
    const isIncome = Math.random() < 0.4; // 40%の確率で収入
    const account = randomElement(isIncome ? incomeAccounts : expenseAccounts);
    const description = randomElement(
      isIncome ? revenueDescriptions : expenseDescriptions
    );
    const amount = isIncome
      ? randomInt(5000, 100000) // 収入: 5,000円〜100,000円
      : randomInt(1000, 50000); // 支出: 1,000円〜50,000円
    const transactionDate = randomDate(fiscalYearStart, fiscalYearEnd);

    const ledger = await prisma.ledger.create({
      data: {
        groupId: group.id,
        createdByMemberId: member.id,
        title: description,
        amount,
        transactionDate,
        status: "APPROVED", // 承認済み
        accountId: account.id,
        notes: `シードデータ（${i + 1}/${ledgerCount}）`,
      },
    });

    createdLedgers.push(ledger);

    if ((i + 1) % 20 === 0) {
      console.log(`${i + 1}件作成完了...`);
    }
  }

  console.log(`\n✅ ${ledgerCount}件のLedgerを作成しました！`);

  // 集計結果を表示
  const totalRevenue = createdLedgers
    .filter((l) => {
      const account = incomeAccounts.find((a) => a.id === l.accountId);
      return account !== undefined;
    })
    .reduce((sum, l) => sum + l.amount, 0);

  const totalExpense = createdLedgers
    .filter((l) => {
      const account = expenseAccounts.find((a) => a.id === l.accountId);
      return account !== undefined;
    })
    .reduce((sum, l) => sum + l.amount, 0);

  const balance = totalRevenue - totalExpense;

  console.log(`\n📊 集計結果:`);
  console.log(`収入合計: ${totalRevenue.toLocaleString("ja-JP")}円`);
  console.log(`支出合計: ${totalExpense.toLocaleString("ja-JP")}円`);
  console.log(`収支差額: ${balance.toLocaleString("ja-JP")}円`);
}

main()
  .catch((e) => {
    console.error("エラーが発生しました:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
