# Monitoring (Sentry)

## 目的
- 本番運用で致命的な例外を即検知する
- 会計（Accounting / Approval / FiscalYearClose / Voting / Audit）の失敗を確実に捕捉する
- 機密情報を送らず、調査に必要な最小情報だけを送る

## 環境変数
`.env` に以下を設定してください。

- `SENTRY_DSN`
- `SENTRY_ENVIRONMENT` (development / staging / production)
- `SENTRY_RELEASE` (任意: リリース識別子)
- `SENTRY_TRACES_SAMPLE_RATE` (任意: 0.0〜1.0)
- `SENTRY_ENABLED` (任意: "true" / "false")

`.env.test` は Sentry を無効化しています。

## 動作確認
開発環境のみで利用可能なエンドポイントを用意しています。

```bash
curl -i http://localhost:3000/api/debug/sentry
```

- `NODE_ENV=production` の場合は 404 を返します。
- 例外が Sentry に送信されることを確認してください。

## 送信するタグ/コンテキスト
主要な書き込み API では以下を付与しています。

- tags: `module`, `action`, `route`, `method`
- context: `knot` (groupId, memberId)
- context: `entity` (ledgerId, fiscalYear, applicationId など)

## 送信しない情報 (サニタイズ)
以下は送信しない/マスクします。

- パスワード、認証トークン、セッション Cookie
- Authorization ヘッダ、Set-Cookie
- 個人のメールアドレス
- 証憑 URL のクエリ
- そのほか機密っぽいキー (password/token/secret/receipt/url など)

実装上は `sendDefaultPii=false` と `beforeSend` で削除/マスクしています。

## 運用ルール
- 会計系（年度締め・承認・Ledger更新）の例外は P0 相当として即調査
- まず Sentry のイベント詳細から groupId / memberId / entityId を確認
- Slack/Email 通知は後続タスクで追加予定

## 補足
- Source map upload は後回し（必要になったら `SENTRY_AUTH_TOKEN` などを用意して設定）
