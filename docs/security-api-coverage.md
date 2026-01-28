# Security Guard Coverage (Write APIs)

## 規約
- 未認証OKのルート：
- guard → (必要なら) session
- ※ rateKey を scope=login 等にする

- 認証必須のルート：
- guard → session → authZ
- ※ session後に memberId を含めた key にできるならより強い

## Summary
- 対象: `web/src/app/api/**/route.ts` の書き込みメソッド (POST/PUT/PATCH/DELETE)
- 合計: 50 エンドポイント
- すべて `assertWriteRequestSecurity()` を先頭で実行済み

## Rule (Write API Security)
- POST/PUT/PATCH/DELETE は必ず `assertWriteRequestSecurity(request, opts?)` を先頭で呼ぶ
- 実行順は固定: **Origin/Referer → RateLimit → (route側で) セッション判定**
- 未認証ルートでも guard は必須 (例: `/api/login`, `/api/register`, `/api/join`, `/api/logout`)
- `rateKey` は必要なら固定文字列で指定する (既存のものは維持)

## How to check
- `web/src/app/api/**/route.ts` の POST/PUT/PATCH/DELETE に `assertWriteRequestSecurity` があることを確認
- 追加の書き込み API を作る場合はこのファイルに追記

## Coverage List
| Method | Route | Guard | Notes |
| --- | --- | --- | --- |
| POST | /api/accounting/carryover | yes |  |
| POST | /api/accounting/fiscal-year-close | yes |  |
| POST | /api/approval/applications | yes |  |
| PATCH | /api/approval/applications/[id] | yes |  |
| POST | /api/approval/routes | yes |  |
| POST | /api/approval/templates | yes |  |
| POST | /api/audit/findings | yes | IP-based rate limit (session取得前にguard実行) |
| PATCH | /api/audit/findings/[id] | yes | IP-based rate limit (session取得前にguard実行) |
| POST | /api/audit/run-internal-controls | yes | IP-based rate limit (session取得前にguard実行) |
| POST | /api/chat/convert/accounting-draft | yes |  |
| POST | /api/chat/convert/meeting-note | yes |  |
| POST | /api/chat/convert/todo | yes |  |
| POST | /api/chat/messages | yes |  |
| POST | /api/chat/messages/[messageId]/convert | yes |  |
| POST | /api/documents | yes |  |
| DELETE | /api/documents/[docId] | yes |  |
| POST | /api/documents/[docId] | yes |  |
| POST | /api/events | yes |  |
| PATCH | /api/events/[id] | yes |  |
| POST | /api/events/[id]/attendance | yes |  |
| PATCH | /api/events/[id]/budget | yes |  |
| POST | /api/events/[id]/budget | yes |  |
| POST | /api/events/[id]/budget/import | yes |  |
| POST | /api/events/[id]/budget/transactions | yes |  |
| DELETE | /api/events/[id]/budget/transactions/[transactionId] | yes |  |
| POST | /api/join | yes | unauth; rateKey=join |
| POST | /api/ledger | yes |  |
| DELETE | /api/ledger/[id] | yes |  |
| PATCH | /api/ledger/[id] | yes |  |
| POST | /api/ledger/[id]/finalize | yes |  |
| POST | /api/ledger/[id]/revert | yes |  |
| POST | /api/login | yes | unauth; scope=login; rateKey=login |
| POST | /api/logout | yes | unauth; rateKey=logout |
| POST | /api/orgs/[orgId]/threads | yes |  |
| POST | /api/personal-events | yes |  |
| POST | /api/receipts | yes |  |
| POST | /api/records | yes |  |
| DELETE | /api/records/[id] | yes |  |
| POST | /api/register | yes | unauth; rateKey=register |
| POST | /api/store/modules | yes |  |
| POST | /api/threads/[threadId]/messages | yes |  |
| PATCH | /api/threads/[threadId]/status | yes |  |
| POST | /api/todos | yes |  |
| PATCH | /api/todos/[todoId]/status | yes |  |
| POST | /api/voting | yes |  |
| PATCH | /api/voting/[id]/close | yes |  |
| POST | /api/voting/[id]/comment | yes |  |
| POST | /api/voting/[id]/convert-to-chat | yes |  |
| POST | /api/voting/[id]/convert-to-todo | yes |  |
| POST | /api/voting/[id]/vote | yes |  |
