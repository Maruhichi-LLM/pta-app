import { prisma } from "@/lib/prisma";
import {
  AccountType,
  FiscalYearCloseStatus,
  LedgerStatus,
  Prisma,
  type Account,
  type FiscalYearClose,
  type Group,
  type Ledger,
  type Member,
  type AccountingSetting,
} from "@prisma/client";

let sequence = 0;
const nextSuffix = () => {
  sequence += 1;
  return `${Date.now()}-${sequence}`;
};

export async function resetDatabase() {
  const tables = await prisma.$queryRaw<Array<{ tablename: string }>>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public'
  `;
  const tableNames = tables.map((table) => `"${table.tablename}"`);
  if (tableNames.length === 0) return;

  await prisma.$executeRawUnsafe(
    `TRUNCATE TABLE ${tableNames.join(", ")} RESTART IDENTITY CASCADE;`
  );
}

export async function createGroup(overrides: Partial<Group> = {}) {
  const suffix = nextSuffix();
  return prisma.group.create({
    data: {
      name: `Test Group ${suffix}`,
      fiscalYearStartMonth: 4,
      ...overrides,
    },
  });
}

export async function createMember({
  groupId,
  ...overrides
}: {
  groupId: number;
} & Partial<Member>) {
  const suffix = nextSuffix();
  return prisma.member.create({
    data: {
      groupId,
      displayName: `Member ${suffix}`,
      role: "ADMIN",
      email: `member-${suffix}@example.com`,
      ...overrides,
    },
  });
}

export async function createAccount({
  groupId,
  ...overrides
}: {
  groupId: number;
} & Partial<Account>) {
  const suffix = nextSuffix();
  return prisma.account.create({
    data: {
      groupId,
      name: `Account ${suffix}`,
      type: AccountType.EXPENSE,
      ...overrides,
    },
  });
}

export async function createLedger({
  groupId,
  createdByMemberId,
  ...overrides
}: {
  groupId: number;
  createdByMemberId: number;
} & Partial<Ledger>) {
  const suffix = nextSuffix();
  return prisma.ledger.create({
    data: {
      groupId,
      createdByMemberId,
      title: `Ledger ${suffix}`,
      amount: 1000,
      transactionDate: new Date("2024-05-01T00:00:00Z"),
      status: LedgerStatus.APPROVED,
      ...overrides,
    },
    include: {
      account: true,
    },
  });
}

export async function createAccountingSetting({
  groupId,
  ...overrides
}: {
  groupId: number;
} & Partial<AccountingSetting>) {
  return prisma.accountingSetting.create({
    data: {
      groupId,
      fiscalYearStartMonth: 4,
      fiscalYearEndMonth: 3,
      carryoverAmount: 0,
      ...overrides,
    },
  });
}

export async function createFiscalYearClose({
  groupId,
  ...overrides
}: {
  groupId: number;
} & Partial<Prisma.FiscalYearCloseUncheckedCreateInput>) {
  return prisma.fiscalYearClose.create({
    data: {
      groupId,
      fiscalYear: 2024,
      startDate: new Date("2024-04-01T00:00:00Z"),
      endDate: new Date("2025-03-31T00:00:00Z"),
      status: FiscalYearCloseStatus.DRAFT,
      ...overrides,
    },
  });
}
