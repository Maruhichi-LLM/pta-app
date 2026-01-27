import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionFromCookies } from "@/lib/session";
import { ROLE_ADMIN, ROLE_ACCOUNTANT } from "@/lib/roles";
import { PDFDocument, rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import fs from "fs";
import path from "path";

function formatCurrency(amount: number): string {
  return `¥${amount.toLocaleString("ja-JP")}`;
}

export async function GET(request: Request) {
  const session = await getSessionFromCookies();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const member = await prisma.member.findUnique({
    where: { id: session.memberId },
    include: { group: true },
  });

  if (!member || (member.role !== ROLE_ADMIN && member.role !== ROLE_ACCOUNTANT) || !member.group) {
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

  const fiscalYearStartMonth = accountingSetting.fiscalYearStartMonth;
  const fiscalYearEndMonth = accountingSetting.fiscalYearEndMonth;

  // 確定済み年度決算データを確認
  const fiscalYearClose = await prisma.fiscalYearClose.findUnique({
    where: {
      groupId_fiscalYear: {
        groupId: member.groupId,
        fiscalYear,
      },
    },
  });

  // データ準備用の変数
  let accountTotals: Map<string, { income: number; expense: number; name: string }>;
  let carryover: number;
  let totalIncome: number;
  let totalExpense: number;
  let balance: number;

  // 確定済みデータがある場合はそれを使用
  if (fiscalYearClose && fiscalYearClose.status === "CONFIRMED") {
    const statement = fiscalYearClose.statement as {
      revenue: Array<{ accountName: string; amount: number }>;
      expense: Array<{ accountName: string; amount: number }>;
      previousCarryover: number;
      totalRevenue: number;
      totalExpense: number;
      nextCarryover: number;
    } | null;

    if (!statement) {
      return NextResponse.json(
        { error: "確定データの形式が不正です。" },
        { status: 500 }
      );
    }

    accountTotals = new Map<string, { income: number; expense: number; name: string }>();

    // 収入科目
    for (const item of statement.revenue) {
      accountTotals.set(item.accountName, {
        name: item.accountName,
        income: item.amount,
        expense: 0,
      });
    }

    // 支出科目
    for (const item of statement.expense) {
      accountTotals.set(item.accountName, {
        name: item.accountName,
        income: 0,
        expense: item.amount,
      });
    }

    carryover = statement.previousCarryover;
    totalIncome = statement.totalRevenue;
    totalExpense = statement.totalExpense;
    balance = fiscalYearClose.nextCarryover - carryover;
  } else {
    // 未確定の場合はリアルタイム計算
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
      },
      orderBy: { transactionDate: "asc" },
    });

    // 勘定科目ごとに集計
    accountTotals = new Map<string, { income: number; expense: number; name: string }>();

    for (const ledger of ledgers) {
      const accountName = ledger.account.name;
      const accountType = ledger.account.type;

      if (!accountTotals.has(accountName)) {
        accountTotals.set(accountName, { income: 0, expense: 0, name: accountName });
      }

      const totals = accountTotals.get(accountName)!;

      if (accountType === "INCOME") {
        totals.income += ledger.amount;
      } else if (accountType === "EXPENSE") {
        totals.expense += Math.abs(ledger.amount);
      }
    }

    // 収入と支出の合計
    totalIncome = 0;
    totalExpense = 0;

    for (const totals of accountTotals.values()) {
      totalIncome += totals.income;
      totalExpense += totals.expense;
    }

    // 前期繰越金: 前年度確定 → フォールバック accountingSetting.carryoverAmount
    const previousYearClose = await prisma.fiscalYearClose.findUnique({
      where: {
        groupId_fiscalYear: {
          groupId: member.groupId,
          fiscalYear: fiscalYear - 1,
        },
      },
      select: { status: true, nextCarryover: true },
    });

    carryover =
      previousYearClose && previousYearClose.status === "CONFIRMED"
        ? previousYearClose.nextCarryover
        : (accountingSetting.carryoverAmount || 0);
    balance = carryover + totalIncome - totalExpense;
  }

  try {
    // PDFドキュメント作成
    const pdfDoc = await PDFDocument.create();
    pdfDoc.registerFontkit(fontkit);

    // 日本語フォントを読み込み
    const fontPath = path.join(process.cwd(), "public", "fonts", "NotoSansJP-Regular.otf");

    if (!fs.existsSync(fontPath)) {
      return NextResponse.json(
        { error: "フォントファイルが見つかりません。" },
        { status: 500 }
      );
    }

    const fontBytes = fs.readFileSync(fontPath);
    const customFont = await pdfDoc.embedFont(fontBytes);

    const pageSize: [number, number] = [595, 842];
    const pageWidth = pageSize[0];
    const pageHeight = pageSize[1];
    let page = pdfDoc.addPage(pageSize);
    let currentY = pageHeight - 50;

    const tableConfig = {
      left: 50,
      right: pageWidth - 50,
      headerHeight: 24,
      rowHeight: 24,
      textSize: 11,
    };
    const tableWidth = tableConfig.right - tableConfig.left;
    const amountColumnX = tableConfig.right - 12;

    const addNewPage = () => {
      page = pdfDoc.addPage(pageSize);
      currentY = pageHeight - 50;
    };

    type TableRow = { label: string; value: string; isTotal?: boolean };

    const drawTableHeader = () => {
      page.drawRectangle({
        x: tableConfig.left,
        y: currentY - tableConfig.headerHeight,
        width: tableWidth,
        height: tableConfig.headerHeight,
        color: rgb(0.93, 0.95, 1),
        borderColor: rgb(0.8, 0.8, 0.8),
        borderWidth: 1,
      });
      page.drawLine({
        start: {
          x: tableConfig.left + tableWidth * 0.65,
          y: currentY - tableConfig.headerHeight,
        },
        end: {
          x: tableConfig.left + tableWidth * 0.65,
          y: currentY,
        },
        thickness: 1,
        color: rgb(0.8, 0.8, 0.8),
      });
      page.drawText("項目", {
        x: tableConfig.left + 12,
        y: currentY - tableConfig.headerHeight + 7,
        size: 11,
        font: customFont,
        color: rgb(0.25, 0.25, 0.25),
      });
      page.drawText("金額", {
        x: amountColumnX - customFont.widthOfTextAtSize("金額", 11),
        y: currentY - tableConfig.headerHeight + 7,
        size: 11,
        font: customFont,
        color: rgb(0.25, 0.25, 0.25),
      });
      currentY -= tableConfig.headerHeight;
    };

    const drawTableRows = (rows: TableRow[]) => {
      let headerDrawn = false;
      const ensureHeader = () => {
        if (!headerDrawn) {
          drawTableHeader();
          headerDrawn = true;
        }
      };
      ensureHeader();
      for (const row of rows) {
        if (currentY - tableConfig.rowHeight < 60) {
          addNewPage();
          headerDrawn = false;
          ensureHeader();
        }

        const rowY = currentY - tableConfig.rowHeight;
        page.drawRectangle({
          x: tableConfig.left,
          y: rowY,
          width: tableWidth,
          height: tableConfig.rowHeight,
          borderColor: rgb(0.85, 0.85, 0.85),
          borderWidth: 1,
          color: row.isTotal ? rgb(0.96, 0.97, 0.99) : undefined,
        });
        page.drawLine({
          start: {
            x: tableConfig.left + tableWidth * 0.65,
            y: rowY,
          },
          end: {
            x: tableConfig.left + tableWidth * 0.65,
            y: rowY + tableConfig.rowHeight,
          },
          thickness: 0.8,
          color: rgb(0.85, 0.85, 0.85),
        });

        const labelSize = row.isTotal ? 12 : tableConfig.textSize;
        const valueSize = row.isTotal ? 12 : tableConfig.textSize;

        page.drawText(row.label, {
          x: tableConfig.left + 12,
          y: rowY + 7,
          size: labelSize,
          font: customFont,
          color: rgb(0.1, 0.1, 0.1),
        });

        const valueWidth = customFont.widthOfTextAtSize(row.value, valueSize);
        page.drawText(row.value, {
          x: amountColumnX - valueWidth,
          y: rowY + 7,
          size: valueSize,
          font: customFont,
          color: rgb(0.1, 0.1, 0.1),
        });

        currentY -= tableConfig.rowHeight;
      }
      currentY -= 20;
    };

    const drawSectionTable = (title: string, rows: TableRow[]) => {
      if (currentY < 120) {
        addNewPage();
      }
      page.drawText(title, {
        x: tableConfig.left,
        y: currentY,
        size: 14,
        font: customFont,
        color: rgb(0, 0, 0),
      });
      currentY -= 25;
      drawTableRows(rows);
    };

    // タイトル
    const title = `${member.group.name} 収支計算書`;
    const titleSize = 18;
    const titleWidth = customFont.widthOfTextAtSize(title, titleSize);

    page.drawText(title, {
      x: (pageWidth - titleWidth) / 2,
      y: currentY,
      size: titleSize,
      font: customFont,
      color: rgb(0, 0, 0),
    });
    currentY -= 30;

    // 会計年度
    const fiscalYearText = `会計年度: ${fiscalYear}年${fiscalYearStartMonth}月 〜 ${fiscalYearEndMonth < fiscalYearStartMonth ? fiscalYear + 1 : fiscalYear}年${fiscalYearEndMonth}月`;
    page.drawText(fiscalYearText, {
      x: 50,
      y: currentY,
      size: 12,
      font: customFont,
      color: rgb(0, 0, 0),
    });
    currentY -= 40;

    const incomeRows: TableRow[] = [
      { label: "前期繰越金", value: formatCurrency(carryover) },
      ...Array.from(accountTotals.entries())
        .filter(([, totals]) => totals.income > 0)
        .map(([name, totals]) => ({
          label: name,
          value: formatCurrency(totals.income),
        })),
      {
        label: "収入合計",
        value: formatCurrency(carryover + totalIncome),
        isTotal: true,
      },
    ];

    const expenseRows: TableRow[] = [
      ...Array.from(accountTotals.entries())
        .filter(([, totals]) => totals.expense > 0)
        .map(([name, totals]) => ({
          label: name,
          value: formatCurrency(totals.expense),
        })),
      {
        label: "支出合計",
        value: formatCurrency(totalExpense),
        isTotal: true,
      },
    ];

    const nextCarryoverRows: TableRow[] = [
      {
        label: "次期繰越金",
        value: formatCurrency(balance),
        isTotal: true,
      },
    ];

    drawSectionTable("【収入の部】", incomeRows);
    drawSectionTable("【支出の部】", expenseRows);
    drawSectionTable("【次期繰越金】", nextCarryoverRows);

    // PDFをバイト配列として保存
    const pdfBytes = await pdfDoc.save();

    return new NextResponse(Buffer.from(pdfBytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="statement-${fiscalYear}.pdf"`,
      },
    });
  } catch (error) {
    console.error("PDF generation error:", error);
    return NextResponse.json(
      { error: "PDFの生成に失敗しました。" },
      { status: 500 }
    );
  }
}
