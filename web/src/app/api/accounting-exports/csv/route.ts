import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionFromCookies } from "@/lib/session";
import { ROLE_ADMIN, ROLE_ACCOUNTANT } from "@/lib/roles";

function escapeCsv(value: string | number | null | undefined) {
  if (value === null || value === undefined) return "";
  const str = String(value);
  if (str.includes('"') || str.includes(",") || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export async function GET(request: Request) {
  const session = await getSessionFromCookies();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const member = await prisma.member.findUnique({
    where: { id: session.memberId },
  });

  if (!member || (member.role !== ROLE_ADMIN && member.role !== ROLE_ACCOUNTANT)) {
    return NextResponse.json({ error: "権限がありません。" }, { status: 403 });
  }

  // クエリパラメータから会計年度を取得
  const { searchParams } = new URL(request.url);
  const fiscalYearParam = searchParams.get("fiscalYear");
  const fiscalYear = fiscalYearParam ? Number(fiscalYearParam) : new Date().getFullYear();

  // 会計年度のデータを取得
  const accountingSetting = await prisma.accountingSetting.findUnique({
    where: { groupId: member.groupId },
  });

  if (!accountingSetting) {
    return NextResponse.json(
      { error: "会計設定が見つかりません。" },
      { status: 404 }
    );
  }

  // 会計年度の開始日と終了日を計算
  const fiscalYearStartMonth = accountingSetting.fiscalYearStartMonth;
  const fiscalYearEndMonth = accountingSetting.fiscalYearEndMonth;

  const startDate = new Date(fiscalYear, fiscalYearStartMonth - 1, 1);
  const endDate = new Date(
    fiscalYearEndMonth < fiscalYearStartMonth ? fiscalYear + 1 : fiscalYear,
    fiscalYearEndMonth,
    0,
    23,
    59,
    59,
    999
  );

  // 経費データを取得
  const ledgers = await prisma.ledger.findMany({
    where: {
      groupId: member.groupId,
      status: "APPROVED",
      transactionDate: {
        gte: startDate,
        lte: endDate,
      },
    },
    include: {
      account: true,
      createdBy: { select: { displayName: true } },
    },
    orderBy: { transactionDate: "asc" },
  });

  const rows = [
    [
      "取引日",
      "勘定科目",
      "科目種別",
      "金額",
      "タイトル",
      "作成者",
      "備考",
    ],
  ];

  const formatter = new Intl.DateTimeFormat("ja-JP", {
    dateStyle: "short",
  });

  for (const ledger of ledgers) {
    rows.push([
      formatter.format(ledger.transactionDate),
      ledger.account.name,
      ledger.account.type,
      ledger.amount.toString(),
      ledger.title,
      ledger.createdBy.displayName,
      ledger.notes ?? "",
    ]);
  }

  // UTF-8 BOMを追加してExcelでの文字化けを防止
  const BOM = "\uFEFF";
  const csv = BOM + rows.map((row) => row.map(escapeCsv).join(",")).join("\n");
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="statement-${fiscalYear}.csv"`,
    },
  });
}
