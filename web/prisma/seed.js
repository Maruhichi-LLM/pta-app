const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  await prisma.attendance.deleteMany();
  await prisma.event.deleteMany();
  await prisma.approval.deleteMany();
  await prisma.ledger.deleteMany();
  await prisma.inviteCode.deleteMany();
  await prisma.member.deleteMany();
  await prisma.group.deleteMany();

  const group = await prisma.group.create({
    data: {
      name: 'Demo Group',
      fiscalYearStartMonth: 4,
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

  console.log('Seed completed:', { group, owner, accountant, event });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
