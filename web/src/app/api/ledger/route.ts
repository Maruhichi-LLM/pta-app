import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionFromCookies } from "@/lib/session";
import { revalidatePath } from "next/cache";

type CreateLedgerRequest = {
  title?: string;
  amount?: number | string;
  receiptUrl?: string;
  notes?: string;
};

export async function POST(request: Request) {
  const session = await getSessionFromCookies();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = ((await request.json().catch(() => ({}))) ??
    {}) as CreateLedgerRequest;

  const title = body.title?.trim();
  const receiptUrl = body.receiptUrl?.trim();
  const notes = body.notes?.trim();
  const amountNumber = Number(body.amount);

  if (!title || !Number.isFinite(amountNumber) || amountNumber <= 0) {
    return NextResponse.json(
      { error: "内容と正しい金額を入力してください。" },
      { status: 400 }
    );
  }

  const ledger = await prisma.ledger.create({
    data: {
      groupId: session.groupId,
      createdByMemberId: session.memberId,
      title,
      amount: Math.round(amountNumber),
      receiptUrl,
      notes,
    },
  });

  revalidatePath("/ledger");

  return NextResponse.json({ success: true, ledger });
}
