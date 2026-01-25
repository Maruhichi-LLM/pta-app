# Knot 拡張モジュール計画書

## 目次
1. [議事録・意思決定記録モジュール](#1-議事録意思決定記録モジュール)
2. [申請・承認フローモジュール（汎用版）](#2-申請承認フローモジュール汎用版)
3. [プロジェクト管理モジュール](#3-プロジェクト管理モジュール)
4. [通知・アナウンスメントモジュール](#4-通知アナウンスメントモジュール)
5. [ダッシュボード・レポートモジュール](#5-ダッシュボードレポートモジュール)
6. [知識ベース/FAQモジュール](#6-知識ベースfaqモジュール)
7. [監査モジュール](#7-監査モジュール)
8. [イベント収支管理モジュール](#8-イベント収支管理モジュール)

---

## 1. 議事録・意思決定記録モジュール

### 概要
会議や意思決定の記録を構造化して管理し、団体のガバナンスを強化する。

### 主要機能
- **会議テンプレート管理**
  - 定例会議、理事会、総会などのテンプレート作成
  - アジェンダ項目の事前設定

- **議事録作成・編集**
  - リアルタイム編集機能
  - 出席者・欠席者の記録
  - 議題ごとの討論内容記録
  - 決議事項の明確な記録

- **投票・採決機能**
  - オンライン投票の実施
  - 賛成・反対・棄権の記録
  - 議決権の管理
  - 投票結果の自動集計

- **検索・参照機能**
  - 過去の決定事項の全文検索
  - 日付・議題・決議内容での絞り込み
  - 関連する議事録の紐付け

### Knot Chatとの統合
- 会議スレッドから自動で議事録ドラフトを生成
- 決議事項を自動的にToDoへ変換
- 議事録から新しいスレッドを作成

### データ構造（想定）
```typescript
model Meeting {
  id: number
  groupId: number
  type: MeetingType // 定例会、理事会、総会など
  title: string
  scheduledAt: DateTime
  location: string?
  attendees: MeetingAttendee[]
  agenda: AgendaItem[]
  decisions: Decision[]
  minutes: string // 議事録本文
  status: MeetingStatus // 予定、進行中、完了
  threadId: number? // 関連チャットスレッド
}

model Decision {
  id: number
  meetingId: number
  title: string
  description: string
  votingResult: VotingResult?
  status: DecisionStatus // 提案、承認、却下
}

model VotingResult {
  id: number
  decisionId: number
  votesFor: number
  votesAgainst: number
  votesAbstain: number
  voters: Vote[]
}
```

---

## 2. 申請・承認フローモジュール（汎用版）

### 概要
経費精算以外の申請プロセスを管理する汎用的なワークフローエンジン。

### 主要機能
- **申請タイプ管理**
  - カスタム申請フォームの作成
  - 入力項目の定義（テキスト、数値、日付、ファイル添付など）
  - 必須項目の設定

- **承認ルート設定**
  - 複数段階の承認フロー
  - 条件分岐（金額、申請者の役職などに応じた分岐）
  - 並列承認（複数承認者の同時承認）
  - 差し戻し・再申請機能

- **申請の種類（例）**
  - 備品購入申請
  - 休暇・欠席申請
  - 外部活動許可申請
  - 施設利用申請
  - 役職変更申請

- **通知機能**
  - 承認待ちの通知
  - 承認・却下の通知
  - 期限アラート

### 既存機能との関係
現在の会計承認フローを汎用化し、様々な申請プロセスに対応できるように拡張。

### データ構造（想定）
```typescript
model ApplicationTemplate {
  id: number
  groupId: number
  name: string // 「備品購入申請」など
  description: string
  fields: ApplicationField[]
  approvalRoute: ApprovalRoute
  isActive: boolean
}

model Application {
  id: number
  groupId: number
  templateId: number
  applicantId: number
  title: string
  data: Json // フォームデータ
  status: ApplicationStatus
  currentApproverIds: number[]
  approvalHistory: ApprovalAction[]
  threadId: number? // 関連スレッド
}

model ApprovalRoute {
  id: number
  steps: ApprovalStep[]
}

model ApprovalStep {
  id: number
  order: number
  approverIds: number[]
  requireAllApprovals: boolean // 全員承認が必要か
  conditions: Json? // 条件分岐
}
```

---

## 3. プロジェクト管理モジュール

### 概要
イベントより長期的な取り組みやプロジェクトを包括的に管理。

### 主要機能
- **プロジェクト設定**
  - プロジェクト名、目的、期間の設定
  - プロジェクトリーダーの指定
  - メンバーアサインと役割分担

- **進捗管理**
  - マイルストーンの設定
  - ガントチャート表示
  - 進捗率の可視化
  - 遅延アラート

- **リソース管理**
  - プロジェクトごとの予算管理
  - プロジェクトに紐付くToDo
  - プロジェクトに紐付くドキュメント
  - プロジェクトに紐付くイベント

- **レポート機能**
  - プロジェクト完了報告
  - 予実管理
  - 振り返り・反省点の記録

### 既存モジュールとの統合
- ToDoをプロジェクトに紐付け
- 会計記録をプロジェクト別に集計
- ドキュメントをプロジェクトフォルダで整理
- プロジェクトごとのチャットスレッド

### データ構造（想定）
```typescript
model Project {
  id: number
  groupId: number
  name: string
  description: string
  leaderId: number
  startDate: DateTime
  endDate: DateTime?
  status: ProjectStatus // 計画中、進行中、完了、中止
  budget: number?
  milestones: Milestone[]
  todos: TodoItem[]
  ledgers: Ledger[]
  documents: Document[]
  events: Event[]
  threadId: number?
}

model Milestone {
  id: number
  projectId: number
  title: string
  dueDate: DateTime
  completedAt: DateTime?
  status: MilestoneStatus
}
```

---

## 4. 通知・アナウンスメントモジュール

### 概要
グループ全体への重要な情報伝達を確実に行う。

### 主要機能
- **お知らせ作成**
  - タイトル、本文、カテゴリー
  - 緊急度の設定（緊急、重要、一般）
  - 添付ファイル
  - 公開期間の設定

- **配信設定**
  - 全メンバー配信
  - 特定の役職のみ配信
  - 個別メンバー選択
  - 予約投稿機能

- **既読管理**
  - 既読・未読の追跡
  - 既読率の表示
  - 未読メンバーへのリマインド

- **通知チャネル**
  - アプリ内通知
  - メール通知
  - プッシュ通知（将来的に）

### カテゴリー例
- 緊急連絡
- 会議のお知らせ
- イベント情報
- システムメンテナンス
- 規約変更
- その他

### データ構造（想定）
```typescript
model Announcement {
  id: number
  groupId: number
  authorId: number
  title: string
  body: string
  category: AnnouncementCategory
  priority: AnnouncementPriority // 緊急、重要、一般
  publishedAt: DateTime?
  expiresAt: DateTime?
  targetMemberIds: number[] // 空の場合は全員
  readStatus: ReadStatus[]
  attachments: string[]
}

model ReadStatus {
  id: number
  announcementId: number
  memberId: number
  readAt: DateTime?
}
```

---

## 5. ダッシュボード・レポートモジュール

### 概要
グループの活動状況を可視化し、データに基づく意思決定をサポート。

### 主要機能
- **ダッシュボード**
  - トップページに活動サマリーを表示
  - カスタマイズ可能なウィジェット
  - 期間指定（今月、今年度など）

- **KPI表示**
  - 予算執行状況（執行率、残予算）
  - ToDo完了率
  - イベント参加率
  - 未読アナウンスメント数
  - 承認待ち申請数
  - プロジェクト進捗率

- **グラフ・チャート**
  - 月次支出推移
  - カテゴリー別支出割合
  - メンバー活動状況
  - イベント参加傾向

- **レポート生成**
  - 会計年度ごとの集計レポート
  - 活動報告書の自動生成
  - PDFエクスポート
  - CSVエクスポート

- **比較分析**
  - 前年度との比較
  - 予算との比較
  - 目標との達成度

### 分析項目例
- **財務**
  - 月別収支
  - 勘定科目別支出
  - プロジェクト別支出
  - イベント別収支

- **活動**
  - メンバー別ToDo達成数
  - イベント参加率の推移
  - チャット活動量
  - ドキュメント登録数

- **ガバナンス**
  - 意思決定の回数
  - 承認フローの所要時間
  - 未解決課題の数

---

## 6. 知識ベース/FAQモジュール

### 概要
団体のノウハウや規約を体系的に管理し、新メンバーのオンボーディングを効率化。

### 主要機能
- **記事管理**
  - カテゴリー別整理
  - タグ付け
  - 全文検索
  - バージョン管理

- **FAQ機能**
  - よくある質問と回答
  - Q&Aの投票機能（役に立った/立たなかった）
  - 関連するFAQの推薦

- **コンテンツの種類**
  - オンボーディングガイド
  - 団体の規約・ルール
  - 業務マニュアル
  - トラブルシューティング
  - 用語集

- **編集権限**
  - 管理者による編集
  - メンバーによる編集提案
  - 承認フロー

### Knot Chatとの統合
- チャットでの質問を自動的にFAQ化する提案
- FAQ記事へのリンクをチャットで共有
- チャットボット的な自動応答（将来的に）

### データ構造（想定）
```typescript
model KnowledgeArticle {
  id: number
  groupId: number
  categoryId: number
  title: string
  content: string
  tags: string[]
  authorId: number
  createdAt: DateTime
  updatedAt: DateTime
  versions: ArticleVersion[]
  isPublished: boolean
  viewCount: number
  helpfulCount: number
}

model ArticleCategory {
  id: number
  groupId: number
  name: string
  description: string
  order: number
  parentId: number? // 階層構造
}

model FAQ {
  id: number
  groupId: number
  question: string
  answer: string
  categoryId: number
  relatedArticles: number[]
  helpfulVotes: number
  notHelpfulVotes: number
}
```

---

## 7. 監査モジュール

### 概要
会計監査および活動監査を支援し、透明性とコンプライアンスを確保。

### 主要機能
- **会計監査**
  - 全ての会計記録の閲覧
  - 期間指定での抽出
  - 証憑（領収書）の確認
  - 不正検出アラート（金額の異常値、頻度など）
  - 監査メモの記録

- **活動監査**
  - 意思決定プロセスの追跡
  - 承認フローの履歴確認
  - 議事録の確認
  - 規約遵守状況のチェック

- **監査レポート**
  - 監査結果報告書の作成
  - 指摘事項の記録
  - 改善提案の管理
  - フォローアップ追跡

- **アクセス権限**
  - 監査役専用のアクセス権
  - 閲覧専用モード
  - 全データへのアクセス（削除権限なし）

- **監査証跡**
  - 誰がいつ何を変更したかのログ
  - データ変更履歴の保存
  - 削除データの復元（一定期間）

### 監査対象
- 会計記録（Ledger）
- 予算執行状況
- 承認フロー
- 意思決定記録
- 規約変更履歴
- メンバー権限変更

### データ構造（想定）
```typescript
model Audit {
  id: number
  groupId: number
  auditorId: number
  type: AuditType // 会計監査、活動監査
  fiscalYear: number
  startDate: DateTime
  endDate: DateTime
  status: AuditStatus // 計画中、実施中、完了
  findings: AuditFinding[]
  report: string?
  completedAt: DateTime?
}

model AuditFinding {
  id: number
  auditId: number
  category: FindingCategory // 指摘、提案、所見
  severity: FindingSeverity // 重大、軽微、情報
  description: string
  relatedRecordType: string // Ledger, Decision, etc.
  relatedRecordId: number
  recommendation: string?
  status: FindingStatus // 未対応、対応中、完了
}

model AuditLog {
  id: number
  groupId: number
  memberId: number
  action: string // CREATE, UPDATE, DELETE
  targetType: string // Ledger, TodoItem, etc.
  targetId: number
  previousValue: Json?
  newValue: Json?
  ipAddress: string?
  timestamp: DateTime
}
```

---

## 8. イベント収支管理モジュール

### 概要
イベントごとの収入・支出を個別に管理し、最終的に本会計に取り込む。

### 主要機能
- **イベント収支記録**
  - イベントに紐付く収入記録
    - 参加費
    - 協賛金
    - 物品販売
    - その他収入
  - イベントに紐付く支出記録
    - 会場費
    - 備品購入
    - 交通費
    - その他経費
  - 証憑の添付

- **イベント予算管理**
  - イベント予算の設定
  - 予算に対する執行状況
  - 予算超過アラート

- **収支集計**
  - イベント単位の損益計算
  - 参加者一人あたりの収支
  - カテゴリー別集計

- **本会計への取り込み**
  - イベント収支の確定
  - 一括で本会計（Ledger）へ転記
  - 勘定科目のマッピング
  - 取り込み履歴の管理
  - 取り込み後の修正制限

- **承認フロー**
  - イベント収支の承認
  - 本会計取り込みの承認
  - 監査役の確認

### ワークフロー
1. イベント作成時に収支管理を有効化
2. イベント期間中に収入・支出を記録
3. イベント終了後、収支を確定
4. 承認者が収支を確認・承認
5. 本会計に一括取り込み
6. 取り込み完了後、イベント収支は読み取り専用に

### データ構造（想定）
```typescript
model EventBudget {
  id: number
  eventId: number
  groupId: number
  plannedRevenue: number // 予定収入
  plannedExpense: number // 予定支出
  actualRevenue: number // 実収入（自動計算）
  actualExpense: number // 実支出（自動計算）
  status: EventBudgetStatus // 計画中、進行中、確定、取込済
  confirmedAt: DateTime?
  confirmedById: number?
  importedToLedgerAt: DateTime?
}

model EventTransaction {
  id: number
  eventBudgetId: number
  eventId: number
  groupId: number
  type: TransactionType // REVENUE（収入）, EXPENSE（支出）
  categoryId: number // イベント収支カテゴリー
  title: string
  amount: number
  transactionDate: DateTime
  receiptUrl: string?
  notes: string?
  createdById: number
  ledgerId: number? // 本会計取込後のLedger ID
  isImported: boolean // 本会計に取り込み済みか
}

model EventTransactionCategory {
  id: number
  groupId: number
  name: string
  type: TransactionType
  defaultAccountId: number? // デフォルトの勘定科目
  isActive: boolean
}

model EventBudgetImport {
  id: number
  eventBudgetId: number
  groupId: number
  fiscalYear: number
  importedAt: DateTime
  importedById: number
  transactionIds: number[] // 取り込んだEventTransaction IDs
  ledgerIds: number[] // 作成したLedger IDs
  totalRevenue: number
  totalExpense: number
  notes: string?
}
```

### 本会計取り込みロジック
```typescript
// EventTransactionから本会計（Ledger）への変換例
async function importEventBudgetToLedger(eventBudgetId: number) {
  const eventBudget = await getEventBudget(eventBudgetId);
  const transactions = await getEventTransactions(eventBudgetId);

  const ledgers = [];

  for (const transaction of transactions) {
    if (transaction.isImported) continue; // 既に取込済みはスキップ

    const ledger = await prisma.ledger.create({
      data: {
        groupId: transaction.groupId,
        title: `${eventBudget.event.title} - ${transaction.title}`,
        amount: transaction.amount,
        transactionDate: transaction.transactionDate,
        receiptUrl: transaction.receiptUrl,
        notes: `イベント収支より取込: ${transaction.notes || ''}`,
        status: LedgerStatus.APPROVED, // 承認済みとして取り込み
        accountId: transaction.category.defaultAccountId,
        createdByMemberId: transaction.createdById,
        sourceThreadId: eventBudget.event.threadId,
      }
    });

    // EventTransactionを取込済みにマーク
    await prisma.eventTransaction.update({
      where: { id: transaction.id },
      data: {
        isImported: true,
        ledgerId: ledger.id,
      }
    });

    ledgers.push(ledger);
  }

  // 取り込み記録を作成
  await prisma.eventBudgetImport.create({
    data: {
      eventBudgetId: eventBudget.id,
      groupId: eventBudget.groupId,
      fiscalYear: getCurrentFiscalYear(),
      importedById: session.memberId,
      transactionIds: transactions.map(t => t.id),
      ledgerIds: ledgers.map(l => l.id),
      totalRevenue: calculateTotalRevenue(transactions),
      totalExpense: calculateTotalExpense(transactions),
    }
  });

  // EventBudgetのステータスを更新
  await prisma.eventBudget.update({
    where: { id: eventBudgetId },
    data: {
      status: EventBudgetStatus.IMPORTED,
      importedToLedgerAt: new Date(),
    }
  });

  return ledgers;
}
```

---

## 実装優先順位

### フェーズ1（コア機能の強化）
1. **イベント収支管理モジュール**
   - 既存のEventモジュールの自然な拡張
   - 会計モジュールとの連携が明確

2. **監査モジュール**
   - ガバナンスの要
   - 既存データ構造で実装可能

3. **ダッシュボード・レポートモジュール**
   - 既存データの可視化
   - ユーザー体験の大幅向上

### フェーズ2（意思決定の強化）
4. **議事録・意思決定記録モジュール**
   - Knotのコアコンセプトに直結
   - Chatモジュールとの強い連携

5. **申請・承認フローモジュール**
   - 既存の会計承認フローを汎用化
   - 組織運営の効率化

### フェーズ3（プロジェクト管理・情報共有）
6. **プロジェクト管理モジュール**
   - 複数モジュールの統合的な活用

7. **通知・アナウンスメントモジュール**
   - 情報伝達の確実性向上

8. **知識ベース/FAQモジュール**
   - 組織の知見の蓄積

---

## 技術的考慮事項

### データベース設計
- 各モジュールは既存のスキーマとの整合性を保つ
- リレーションは明確に定義
- インデックスの適切な設定

### モジュール間連携
- ChatThreadとの紐付けを標準化
- sourceType enumの拡張
- revalidatePath()の適切な使用

### パフォーマンス
- 大量データの集計はバックグラウンド処理
- キャッシュの活用
- ページネーション

### セキュリティ
- ロールベースアクセス制御（RBAC）
- 監査ログの暗号化
- データ保持ポリシー

---

## まとめ

Knotは「意思決定を結ぶ」というコンセプトのもと、団体運営に必要な機能を統合的に提供するプラットフォームです。これらの拡張モジュールにより、以下が実現されます：

1. **透明性の向上**: 監査モジュールと意思決定記録により、全ての活動が追跡可能
2. **効率化**: 申請フローやプロジェクト管理により、業務プロセスが標準化
3. **データドリブンな意思決定**: ダッシュボードにより、データに基づく判断が可能
4. **知識の蓄積**: FAQや議事録により、組織の知見が体系化
5. **正確な会計管理**: イベント収支の個別管理と本会計への適切な取り込み

各モジュールは独立して機能しつつ、Knot Chatを中心に有機的に連携し、団体運営の全体最適を実現します。
