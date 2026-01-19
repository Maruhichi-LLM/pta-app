const {
  PrismaClient,
  AccountType,
  FinancialAccountType,
} = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  await prisma.attendance.deleteMany();
  await prisma.event.deleteMany();
  await prisma.approval.deleteMany();
  await prisma.ledger.deleteMany();
  await prisma.financialAccount.deleteMany();
  await prisma.account.deleteMany();
  await prisma.accountingSetting.deleteMany();
  await prisma.inviteCode.deleteMany();
  await prisma.member.deleteMany();
  await prisma.group.deleteMany();

  const group = await prisma.group.create({
    data: {
      name: 'Demo Group',
      fiscalYearStartMonth: 4,
    },
  });

  const accountingSetting = await prisma.accountingSetting.create({
    data: {
      groupId: group.id,
      fiscalYearStartMonth: group.fiscalYearStartMonth,
      fiscalYearEndMonth: 3,
      approvalFlow: '会計係 → 管理者 → 監査',
      carryoverAmount: 50000,
    },
  });

  const adminPasswordHash = await bcrypt.hash('password123', 10);
  const accountantPasswordHash = await bcrypt.hash('password123', 10);

  const owner = await prisma.member.create({
    data: {
      groupId: group.id,
      displayName: 'Demo Owner',
      role: '管理者',
      email: 'demo-admin@example.com',
      passwordHash: adminPasswordHash,
    },
  });

  const accountant = await prisma.member.create({
    data: {
      groupId: group.id,
      displayName: 'Demo Accountant',
      role: '会計係',
      email: 'demo-accountant@example.com',
      passwordHash: accountantPasswordHash,
    },
  });

  const defaultAccounts = [
    { name: '現金', type: AccountType.ASSET },
    { name: '普通預金', type: AccountType.ASSET },
    { name: '定期預金', type: AccountType.ASSET },
    { name: '会費収入', type: AccountType.INCOME },
    { name: '事業収入', type: AccountType.INCOME },
    { name: '補助金等収入', type: AccountType.INCOME },
    { name: '寄附金収入', type: AccountType.INCOME },
    { name: '雑収入', type: AccountType.INCOME },
    { name: '受取利息', type: AccountType.INCOME },
    { name: '受取配当金', type: AccountType.INCOME },
    { name: '給与賃金', type: AccountType.EXPENSE },
    { name: '地代家賃', type: AccountType.EXPENSE },
    { name: '租税公課', type: AccountType.EXPENSE },
    { name: '水道光熱費', type: AccountType.EXPENSE },
    { name: '旅費交通費', type: AccountType.EXPENSE },
    { name: '通信費', type: AccountType.EXPENSE },
    { name: '消耗品費', type: AccountType.EXPENSE },
    { name: '修繕費', type: AccountType.EXPENSE },
    { name: '支払手数料', type: AccountType.EXPENSE },
    { name: '広告宣伝費', type: AccountType.EXPENSE },
    { name: '会議費', type: AccountType.EXPENSE },
    { name: '交際費', type: AccountType.EXPENSE },
    { name: '支払保険料', type: AccountType.EXPENSE },
    { name: '福利厚生費', type: AccountType.EXPENSE },
    { name: '減価償却費', type: AccountType.EXPENSE },
    { name: '雑費', type: AccountType.EXPENSE },
  ];

  await prisma.account.createMany({
    data: defaultAccounts.map((account, index) => ({
      groupId: group.id,
      name: account.name,
      type: account.type,
      isCustom: false,
      order: index,
    })),
  });

  await prisma.financialAccount.createMany({
    data: [
      {
        groupId: group.id,
        name: '現金',
        type: FinancialAccountType.CASH,
        initialBalance: 20000,
        currentBalance: 20000,
      },
      {
        groupId: group.id,
        name: 'ゆうちょ銀行',
        type: FinancialAccountType.BANK,
        bankName: 'ゆうちょ銀行',
        accountNumber: '1234567',
        initialBalance: 80000,
        currentBalance: 80000,
      },
    ],
  });

  await prisma.inviteCode.createMany({
    data: [
      {
        groupId: group.id,
        code: 'DEMO1234',
        role: 'メンバー',
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
      {
        groupId: group.id,
        code: 'ACCT1234',
        role: '会計係',
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
    ],
  });

  await prisma.ledger.create({
    data: {
      groupId: group.id,
      createdByMemberId: accountant.id,
      title: 'イベント備品購入',
      amount: 12000,
      receiptUrl: 'https://example.com/receipt/demo',
      notes: 'ボールとビブス',
      status: 'PENDING',
    },
  });

  const event = await prisma.event.create({
    data: {
      groupId: group.id,
      title: '4月定例会',
      description: '年間予定と役割分担を行います。',
      location: '市民センター 第1会議室',
      startsAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    },
  });

  await prisma.attendance.create({
    data: {
      eventId: event.id,
      memberId: owner.id,
      status: 'YES',
      comment: '参加します。',
    },
  });

  await prisma.attendance.create({
    data: {
      eventId: event.id,
      memberId: accountant.id,
      status: 'MAYBE',
      comment: '日程調整中です。',
    },
  });

  console.log('Seed completed:', {
    group,
    accountingSetting,
    owner,
    accountant,
    event,
  });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
