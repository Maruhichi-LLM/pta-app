# Knot Event拡張: イベント収支管理 実装ガイド

## 目次
1. [実装の全体像](#実装の全体像)
2. [フェーズ1: データベーススキーマ](#フェーズ1-データベーススキーマ)
3. [フェーズ2: モジュール管理](#フェーズ2-モジュール管理)
4. [フェーズ3: バックエンドAPI](#フェーズ3-バックエンドapi)
5. [フェーズ4: フロントエンドUI](#フェーズ4-フロントエンドui)
6. [フェーズ5: 本会計取り込み](#フェーズ5-本会計取り込み)
7. [テストシナリオ](#テストシナリオ)

---

## 実装の全体像

### アーキテクチャ
```
┌─────────────────────────────────────────────┐
│ Knot Store (モジュール管理)                 │
│ - event-budget を有効化/無効化              │
└─────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────┐
│ Knot Event (基本機能)                       │
│ /events - イベント一覧                      │
│ /events/[id] - イベント詳細                 │
└─────────────────────────────────────────────┘
                    ↓ event-budget有効時
┌─────────────────────────────────────────────┐
│ Event Budget (拡張機能)                     │
│ - 収支記録                                  │
│ - 予算管理                                  │
│ - 本会計取り込み                            │
└─────────────────────────────────────────────┘
                    ↓ 取り込み時
┌─────────────────────────────────────────────┐
│ Knot Accounting                             │
│ - Ledger（本会計）                          │
└─────────────────────────────────────────────┘
```

---

## フェーズ1: データベーススキーマ

### 1.1 Prismaスキーマの拡張

**ファイル**: `web/prisma/schema.prisma`

```prisma
// 既存のEventモデルに追加
model Event {
  id          Int           @id @default(autoincrement())
  groupId     Int
  group       Group         @relation(fields: [groupId], references: [id])
  title       String
  description String?
  location    String?
  startsAt    DateTime
  endsAt      DateTime?
  attendances Attendance[]
  createdAt   DateTime      @default(now())
  updatedAt   DateTime      @updatedAt
  documents   Document[]

  // 新規追加: イベント収支管理
  eventBudget EventBudget?
}

// 新規モデル: イベント予算
model EventBudget {
  id               Int                  @id @default(autoincrement())
  eventId          Int                  @unique
  event            Event                @relation(fields: [eventId], references: [id], onDelete: Cascade)
  groupId          Int
  group            Group                @relation(fields: [groupId], references: [id])

  plannedRevenue   Int                  @default(0) // 予定収入
  plannedExpense   Int                  @default(0) // 予定支出

  status           EventBudgetStatus    @default(PLANNING)
  confirmedAt      DateTime?
  confirmedById    Int?
  confirmedBy      Member?              @relation("EventBudgetConfirmedBy", fields: [confirmedById], references: [id])

  importedToLedgerAt DateTime?

  transactions     EventTransaction[]
  imports          EventBudgetImport[]

  createdAt        DateTime             @default(now())
  updatedAt        DateTime             @updatedAt

  @@index([groupId])
  @@index([status])
}

// 新規モデル: イベント収支取引
model EventTransaction {
  id              Int                      @id @default(autoincrement())
  eventBudgetId   Int
  eventBudget     EventBudget              @relation(fields: [eventBudgetId], references: [id], onDelete: Cascade)
  groupId         Int
  group           Group                    @relation(fields: [groupId], references: [id])

  type            EventTransactionType     // REVENUE or EXPENSE
  categoryId      Int
  category        EventTransactionCategory @relation(fields: [categoryId], references: [id])

  title           String
  amount          Int
  transactionDate DateTime                 @default(now())
  receiptUrl      String?
  notes           String?

  createdById     Int
  createdBy       Member                   @relation("EventTransactionCreatedBy", fields: [createdById], references: [id])

  // 本会計取り込み関連
  isImported      Boolean                  @default(false)
  ledgerId        Int?                     @unique
  ledger          Ledger?                  @relation("EventTransactionLedger", fields: [ledgerId], references: [id])

  createdAt       DateTime                 @default(now())
  updatedAt       DateTime                 @updatedAt

  @@index([eventBudgetId])
  @@index([groupId])
  @@index([type])
  @@index([isImported])
}

// 新規モデル: イベント収支カテゴリー
model EventTransactionCategory {
  id               Int                    @id @default(autoincrement())
  groupId          Int
  group            Group                  @relation(fields: [groupId], references: [id])

  name             String
  type             EventTransactionType   // REVENUE or EXPENSE
  defaultAccountId Int?
  defaultAccount   Account?               @relation(fields: [defaultAccountId], references: [id])

  isActive         Boolean                @default(true)
  order            Int                    @default(0)

  transactions     EventTransaction[]

  createdAt        DateTime               @default(now())

  @@index([groupId, type])
}

// 新規モデル: イベント収支取り込み履歴
model EventBudgetImport {
  id              Int          @id @default(autoincrement())
  eventBudgetId   Int
  eventBudget     EventBudget  @relation(fields: [eventBudgetId], references: [id])
  groupId         Int
  group           Group        @relation(fields: [groupId], references: [id])

  fiscalYear      Int
  importedAt      DateTime     @default(now())
  importedById    Int
  importedBy      Member       @relation("EventBudgetImportedBy", fields: [importedById], references: [id])

  transactionIds  Int[]        // 取り込んだEventTransaction IDs
  ledgerIds       Int[]        // 作成したLedger IDs

  totalRevenue    Int
  totalExpense    Int
  notes           String?

  @@index([groupId, fiscalYear])
}

// 新規enum
enum EventBudgetStatus {
  PLANNING      // 計画中
  IN_PROGRESS   // 進行中
  CONFIRMED     // 確定済み
  IMPORTED      // 本会計取込済
}

enum EventTransactionType {
  REVENUE       // 収入
  EXPENSE       // 支出
}

// Groupモデルに追加
model Group {
  // ... 既存フィールド
  eventBudgets              EventBudget[]
  eventTransactions         EventTransaction[]
  eventTransactionCategories EventTransactionCategory[]
  eventBudgetImports        EventBudgetImport[]
}

// Memberモデルに追加
model Member {
  // ... 既存フィールド
  eventTransactionsCreated  EventTransaction[]       @relation("EventTransactionCreatedBy")
  eventBudgetsConfirmed     EventBudget[]            @relation("EventBudgetConfirmedBy")
  eventBudgetImports        EventBudgetImport[]      @relation("EventBudgetImportedBy")
}

// Ledgerモデルに追加
model Ledger {
  // ... 既存フィールド
  eventTransaction          EventTransaction?        @relation("EventTransactionLedger")
}
```

### 1.2 マイグレーション実行

```bash
cd web
npx prisma format
npx prisma migrate dev --name add_event_budget
npx prisma generate
```

---

## フェーズ2: モジュール管理

### 2.1 モジュール定義の追加

**ファイル**: `web/src/lib/modules.ts`

既存の`ensureModuleEnabled`関数を確認し、`event-budget`を認識できるようにする。

```typescript
// modules.tsに追加（既存のコードを確認して適切に統合）
export const AVAILABLE_MODULES = [
  "chat",
  "todo",
  "event",
  "event-budget",  // 新規追加
  "accounting",
  "document",
] as const;

export type ModuleName = typeof AVAILABLE_MODULES[number];

// event-budgetの利用にはeventモジュールが必要
export async function ensureEventBudgetEnabled(groupId: number) {
  await ensureModuleEnabled(groupId, "event");
  await ensureModuleEnabled(groupId, "event-budget");
}
```

### 2.2 デフォルトカテゴリーのシード

**ファイル**: `web/prisma/seed.ts`

```typescript
// seed.tsに追加
async function seedEventTransactionCategories(groupId: number) {
  const revenueCategories = [
    { name: "参加費", type: "REVENUE" },
    { name: "協賛金", type: "REVENUE" },
    { name: "物品販売", type: "REVENUE" },
    { name: "その他収入", type: "REVENUE" },
  ];

  const expenseCategories = [
    { name: "会場費", type: "EXPENSE" },
    { name: "備品購入", type: "EXPENSE" },
    { name: "交通費", type: "EXPENSE" },
    { name: "食費", type: "EXPENSE" },
    { name: "その他経費", type: "EXPENSE" },
  ];

  for (const [index, cat] of revenueCategories.entries()) {
    await prisma.eventTransactionCategory.create({
      data: {
        groupId,
        name: cat.name,
        type: cat.type as EventTransactionType,
        order: index,
      },
    });
  }

  for (const [index, cat] of expenseCategories.entries()) {
    await prisma.eventTransactionCategory.create({
      data: {
        groupId,
        name: cat.name,
        type: cat.type as EventTransactionType,
        order: index,
      },
    });
  }
}
```

---

## フェーズ3: バックエンドAPI

### 3.1 EventBudget作成API

**ファイル**: `web/src/app/api/events/[eventId]/budget/route.ts`

```typescript
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionFromCookies } from "@/lib/session";
import { ensureEventBudgetEnabled } from "@/lib/modules";
import { revalidatePath } from "next/cache";

type CreateBudgetRequest = {
  plannedRevenue: number;
  plannedExpense: number;
};

export async function POST(
  request: Request,
  { params }: { params: Promise<{ eventId: string }> }
) {
  const session = await getSessionFromCookies();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await ensureEventBudgetEnabled(session.groupId);

  const { eventId: eventIdString } = await params;
  const eventId = Number(eventIdString);

  const event = await prisma.event.findFirst({
    where: { id: eventId, groupId: session.groupId },
    include: { eventBudget: true },
  });

  if (!event) {
    return NextResponse.json({ error: "Event not found" }, { status: 404 });
  }

  if (event.eventBudget) {
    return NextResponse.json(
      { error: "Budget already exists" },
      { status: 400 }
    );
  }

  const body = ((await request.json().catch(() => ({}))) ??
    {}) as CreateBudgetRequest;

  const eventBudget = await prisma.eventBudget.create({
    data: {
      eventId: event.id,
      groupId: session.groupId,
      plannedRevenue: body.plannedRevenue || 0,
      plannedExpense: body.plannedExpense || 0,
      status: "PLANNING",
    },
  });

  revalidatePath(`/events/${eventId}`);

  return NextResponse.json({ success: true, eventBudget });
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ eventId: string }> }
) {
  const session = await getSessionFromCookies();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { eventId: eventIdString } = await params;
  const eventId = Number(eventIdString);

  const eventBudget = await prisma.eventBudget.findFirst({
    where: {
      eventId,
      groupId: session.groupId,
    },
    include: {
      transactions: {
        include: {
          category: true,
          createdBy: { select: { id: true, displayName: true } },
        },
        orderBy: { transactionDate: "desc" },
      },
    },
  });

  if (!eventBudget) {
    return NextResponse.json({ error: "Budget not found" }, { status: 404 });
  }

  return NextResponse.json(eventBudget);
}
```

### 3.2 EventTransaction作成API

**ファイル**: `web/src/app/api/events/[eventId]/transactions/route.ts`

```typescript
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionFromCookies } from "@/lib/session";
import { revalidatePath } from "next/cache";

type CreateTransactionRequest = {
  type: "REVENUE" | "EXPENSE";
  categoryId: number;
  title: string;
  amount: number;
  transactionDate: string;
  receiptUrl?: string;
  notes?: string;
};

export async function POST(
  request: Request,
  { params }: { params: Promise<{ eventId: string }> }
) {
  const session = await getSessionFromCookies();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { eventId: eventIdString } = await params;
  const eventId = Number(eventIdString);

  const eventBudget = await prisma.eventBudget.findFirst({
    where: {
      eventId,
      groupId: session.groupId,
    },
  });

  if (!eventBudget) {
    return NextResponse.json(
      { error: "Event budget not found" },
      { status: 404 }
    );
  }

  if (eventBudget.status === "IMPORTED") {
    return NextResponse.json(
      { error: "Cannot add transaction to imported budget" },
      { status: 400 }
    );
  }

  const body = ((await request.json().catch(() => ({}))) ??
    {}) as CreateTransactionRequest;

  const transaction = await prisma.eventTransaction.create({
    data: {
      eventBudgetId: eventBudget.id,
      groupId: session.groupId,
      type: body.type,
      categoryId: body.categoryId,
      title: body.title,
      amount: body.amount,
      transactionDate: new Date(body.transactionDate),
      receiptUrl: body.receiptUrl,
      notes: body.notes,
      createdById: session.memberId,
    },
    include: {
      category: true,
      createdBy: { select: { id: true, displayName: true } },
    },
  });

  revalidatePath(`/events/${eventId}`);

  return NextResponse.json({ success: true, transaction });
}
```

### 3.3 本会計取り込みAPI

**ファイル**: `web/src/app/api/events/[eventId]/import-to-ledger/route.ts`

```typescript
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionFromCookies } from "@/lib/session";
import { LedgerStatus } from "@prisma/client";
import { revalidatePath } from "next/cache";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ eventId: string }> }
) {
  const session = await getSessionFromCookies();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { eventId: eventIdString } = await params;
  const eventId = Number(eventIdString);

  const eventBudget = await prisma.eventBudget.findFirst({
    where: {
      eventId,
      groupId: session.groupId,
    },
    include: {
      event: true,
      transactions: {
        include: {
          category: true,
        },
      },
    },
  });

  if (!eventBudget) {
    return NextResponse.json(
      { error: "Event budget not found" },
      { status: 404 }
    );
  }

  if (eventBudget.status === "IMPORTED") {
    return NextResponse.json(
      { error: "Already imported" },
      { status: 400 }
    );
  }

  if (eventBudget.status !== "CONFIRMED") {
    return NextResponse.json(
      { error: "Budget must be confirmed first" },
      { status: 400 }
    );
  }

  const ledgers = [];
  const importedTransactionIds = [];

  for (const transaction of eventBudget.transactions) {
    if (transaction.isImported) continue;

    const ledger = await prisma.ledger.create({
      data: {
        groupId: session.groupId,
        createdByMemberId: transaction.createdById,
        title: `${eventBudget.event.title} - ${transaction.title}`,
        amount: transaction.amount,
        transactionDate: transaction.transactionDate,
        receiptUrl: transaction.receiptUrl,
        notes: `イベント収支より取込: ${transaction.notes || ""}`,
        status: LedgerStatus.APPROVED,
        accountId: transaction.category.defaultAccountId,
      },
    });

    await prisma.eventTransaction.update({
      where: { id: transaction.id },
      data: {
        isImported: true,
        ledgerId: ledger.id,
      },
    });

    ledgers.push(ledger);
    importedTransactionIds.push(transaction.id);
  }

  const totalRevenue = eventBudget.transactions
    .filter((t) => t.type === "REVENUE")
    .reduce((sum, t) => sum + t.amount, 0);

  const totalExpense = eventBudget.transactions
    .filter((t) => t.type === "EXPENSE")
    .reduce((sum, t) => sum + t.amount, 0);

  await prisma.eventBudgetImport.create({
    data: {
      eventBudgetId: eventBudget.id,
      groupId: session.groupId,
      fiscalYear: new Date().getFullYear(),
      importedById: session.memberId,
      transactionIds: importedTransactionIds,
      ledgerIds: ledgers.map((l) => l.id),
      totalRevenue,
      totalExpense,
    },
  });

  await prisma.eventBudget.update({
    where: { id: eventBudget.id },
    data: {
      status: "IMPORTED",
      importedToLedgerAt: new Date(),
    },
  });

  revalidatePath(`/events/${eventId}`);
  revalidatePath("/accounting");

  return NextResponse.json({
    success: true,
    imported: ledgers.length,
    ledgers,
  });
}
```

---

## フェーズ4: フロントエンドUI

### 4.1 イベント詳細ページの作成

**ファイル**: `web/src/app/events/[id]/page.tsx`

```typescript
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getSessionFromCookies } from "@/lib/session";
import { ensureModuleEnabled, isModuleEnabled } from "@/lib/modules";
import { EventBudgetSection } from "@/components/event-budget-section";

export default async function EventDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getSessionFromCookies();
  if (!session) {
    redirect("/join");
  }

  await ensureModuleEnabled(session.groupId, "event");

  const { id: eventIdString } = await params;
  const eventId = Number(eventIdString);

  const event = await prisma.event.findFirst({
    where: { id: eventId, groupId: session.groupId },
    include: {
      attendances: {
        include: { member: true },
        orderBy: { respondedAt: "desc" },
      },
      eventBudget: {
        include: {
          transactions: {
            include: {
              category: true,
              createdBy: { select: { id: true, displayName: true } },
            },
            orderBy: { transactionDate: "desc" },
          },
        },
      },
    },
  });

  if (!event) {
    redirect("/events");
  }

  const budgetEnabled = await isModuleEnabled(session.groupId, "event-budget");

  return (
    <div className="min-h-screen py-10">
      <div className="page-shell space-y-8">
        <header className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
          <h1 className="text-3xl font-semibold text-zinc-900">
            {event.title}
          </h1>
          {/* イベント詳細 */}
        </header>

        {budgetEnabled && (
          <EventBudgetSection
            eventId={event.id}
            eventBudget={event.eventBudget}
            groupId={session.groupId}
          />
        )}
      </div>
    </div>
  );
}
```

### 4.2 Event Budget セクションコンポーネント

**ファイル**: `web/src/components/event-budget-section.tsx`

```typescript
"use client";

import { useState } from "react";
import { EventBudget, EventTransaction } from "@prisma/client";
// ... 詳細は実装時に作成
```

---

## フェーズ5: 本会計取り込み

### 5.1 取り込みボタンとフロー

1. イベント収支を「確定」状態にする
2. 「本会計に取り込む」ボタンをクリック
3. 確認ダイアログで取り込み内容を確認
4. API呼び出しで一括取り込み
5. Ledgerテーブルに記録が追加される
6. EventBudgetは読み取り専用になる

---

## テストシナリオ

### シナリオ1: 基本フロー
1. イベントを作成
2. 「収支管理を使う」を有効化
3. 予算を設定（収入10万円、支出8万円）
4. 参加費を記録（収入5万円）
5. 会場費を記録（支出3万円）
6. 収支を確定
7. 本会計に取り込み
8. Knot Accountingで確認

### シナリオ2: 複数カテゴリー
1. 収入3件、支出5件を記録
2. カテゴリー別集計を確認
3. 本会計に一括取り込み

### シナリオ3: 取り込み後の制限
1. 取り込み済みイベントで収支追加を試みる
2. エラーメッセージが表示されることを確認

---

## 実装チェックリスト

### データベース
- [ ] Prismaスキーマ追加
- [ ] マイグレーション実行
- [ ] シードデータ作成

### モジュール管理
- [ ] event-budget モジュール定義
- [ ] ensureEventBudgetEnabled 実装

### API
- [ ] EventBudget作成API
- [ ] EventTransaction作成API
- [ ] 本会計取り込みAPI
- [ ] カテゴリー一覧API

### UI
- [ ] イベント詳細ページ
- [ ] 収支記録フォーム
- [ ] 収支サマリー表示
- [ ] 取り込みボタンと確認ダイアログ

### テスト
- [ ] 基本フローテスト
- [ ] エッジケーステスト
- [ ] パフォーマンステスト

---

## 次のステップ

実装を開始する準備ができたら、以下の順序で進めることをお勧めします：

1. **フェーズ1（データベース）から開始**
2. 各フェーズを順次実装
3. 各フェーズ完了後に動作確認
4. 最後に統合テスト

どのフェーズから始めますか？
