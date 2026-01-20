This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## ローカル開発手順

PostgreSQL は docker compose で起動します。初回は下記の流れで Prisma のマイグレーションとシードを実行してください。

```bash
cp .env.example .env   # web ディレクトリで DATABASE_URL をセット
docker compose up -d --build  # リポジトリルートで app+db を起動
cd web
npx prisma migrate dev
npx prisma db seed
```

`.env` には `DATABASE_URL=postgresql://app:app@localhost:5432/app` と `SESSION_SECRET` を設定してください。Prisma の migrate/seed は上記 `.env` を参照します。

## 認証フロー

- `/register` : 団体名・会計年度・代表者情報（メール/パスワード）を入力して団体と管理者アカウントを作成します。
- `/login` : 登録済みのメールアドレスとパスワードでログインします。
- `/join` : 招待コードを受け取ったメンバーが、表示名・メール・パスワードを入力して参加します。

## 最小画面

- `/join` : 招待コード（例: `DEMO1234`）と表示名を入力すると Member が作成され、cookie セッションが発行されます。
- `/calendar` : セッション情報から団体名と自分の表示名を表示し、ログアウトボタンで cookie を削除できます。
- `/ledger` : 会計仕訳の登録と金額・証憑URL表示、承認/却下および承認ログの確認ができます。
- `/events` : イベント一覧と出欠（yes / maybe / no + コメント）を登録・確認できます。`管理者` ロールはイベント作成・編集、CSV/PDF エクスポートが可能です。

## 権限と初期アカウント

- `管理者` : 団体設定・イベント作成・エクスポートなど全権操作  
  - Seed では `demo-admin@example.com / password123`
- `会計係` : 会計実務を担当（`demo-accountant@example.com / password123`）
- `メンバー` : 一般メンバー（招待コード `DEMO1234` で参加）
- 会計係用招待コード `ACCT1234`、一般メンバー用 `DEMO1234`

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
