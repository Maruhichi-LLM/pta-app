# DB バックアップ／リストア手順（PostgreSQL + Docker）

会計・承認・投票・監査などの重要データを事故から守るため、
**「壊れたら戻せる」状態を明文化**した手順です。

## 前提

- PostgreSQL は Docker コンテナで稼働（例: `knot-db`）
- Prisma はマイグレーション管理に利用
- バックアップは **DB レベル（`pg_dump`）** で実施

> コンテナ名は環境により異なることがあります。事前に `docker ps` で確認してください。

---

## バックアップ（pg_dump）

### 目的
データを **整合性のあるスナップショットとして保存**します。

### 1. 事前確認（本番／dev の切り分け）

- **本番と開発は必ず出力先ディレクトリを分ける**（例: `backups/prod/` と `backups/dev/`）
- 本番は **アクセス権がある運用者のみ**が実行

```bash
# 例: コンテナ名を確認
docker ps --format "table {{.Names}}\t{{.Image}}"
```

### 2. フルバックアップ（推奨: カスタム形式）

カスタム形式は `pg_restore` で柔軟に復元できるため推奨です。

```bash
# 例: 日付をファイル名に入れる
BACKUP_DATE=$(date +%Y%m%d)
BACKUP_NAME="knot-prod-${BACKUP_DATE}.dump"

# コンテナ内にダンプを作成
# 必要なら PGPASSWORD を利用（例: PGPASSWORD=app）
docker exec -i knot-db pg_dump -U app -d app -F c -f "/tmp/${BACKUP_NAME}"

# ホストへコピー
mkdir -p backups/prod
docker cp "knot-db:/tmp/${BACKUP_NAME}" "./backups/prod/${BACKUP_NAME}"

# 確認
ls -lh "./backups/prod/${BACKUP_NAME}"
```

### 3. 代替: SQL 形式（`psql` で復元する場合）

```bash
BACKUP_DATE=$(date +%Y%m%d)
BACKUP_NAME="knot-prod-${BACKUP_DATE}.sql"

mkdir -p backups/prod
# 標準出力に出す場合は -i 推奨（TTY を使わない）
docker exec -i knot-db pg_dump -U app -d app -F p > "./backups/prod/${BACKUP_NAME}"

ls -lh "./backups/prod/${BACKUP_NAME}"
```

### 本番／dev の使い分け注意点

- **本番データを dev に戻す場合**は、情報漏えい・個人情報取り扱いに注意
- **dev データを本番へ戻すのは原則禁止**（事前に承認を取る）
- どの環境のバックアップか **ファイル名・保存先で明確化**する

---

## リストア

### 目的
- 事故時に **確実に復旧**できるようにする
- 本番での作業前に **別DBで事前検証**する

### A. 既存 DB を消して戻す（本番復旧用）

> **注意:** 実行前にアプリの書き込みを止め、対象 DB が確実に正しいことを確認してください。

1. **アプリ停止／書き込み停止**（メンテナンスモードなど）
2. **既存 DB の削除 → 作成**

```bash
# 接続が残っている場合は切断してから削除
# ここでは app DB を想定

docker exec -i knot-db psql -U app -d postgres -c \
  "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = 'app';"

# 削除 → 再作成
docker exec -i knot-db psql -U app -d postgres -c "DROP DATABASE app;"
docker exec -i knot-db psql -U app -d postgres -c "CREATE DATABASE app;"
```

3. **リストア（カスタム形式）**

```bash
# ホストにあるバックアップをコンテナへ戻す
BACKUP_NAME="knot-prod-20260128.dump"

docker cp "./backups/prod/${BACKUP_NAME}" "knot-db:/tmp/${BACKUP_NAME}"

docker exec -i knot-db pg_restore -U app -d app "/tmp/${BACKUP_NAME}"
```

4. **動作確認**

- 主要画面や API の基本動作を確認
- `npx prisma migrate status` などでスキーマ状態を確認（必要に応じて）

### B. 別 DB に戻して安全に確認する（推奨）

> 本番に影響を与えずに確認したい場合の手順です。

1. **検証用 DB を作成**

```bash
RESTORE_DB="app_restore_20260128"

docker exec -i knot-db psql -U app -d postgres -c "CREATE DATABASE ${RESTORE_DB};"
```

2. **バックアップを検証用 DB に復元**

```bash
BACKUP_NAME="knot-prod-20260128.dump"

docker cp "./backups/prod/${BACKUP_NAME}" "knot-db:/tmp/${BACKUP_NAME}"

docker exec -i knot-db pg_restore -U app -d "${RESTORE_DB}" "/tmp/${BACKUP_NAME}"
```

3. **検証方法の例**

- ローカルで `DATABASE_URL` を一時的に `app_restore_20260128` に向ける
- 重要な帳票・集計・投票結果などを確認

### SQL 形式の復元（`psql`）

```bash
BACKUP_NAME="knot-prod-20260128.sql"

docker exec -i knot-db psql -U app -d app < "./backups/prod/${BACKUP_NAME}"
```

---

## 運用ルール

### バックアップを取るタイミング

- **年度締め前後**（会計・監査のため必須）
- **本番リリース前**（スキーマ変更・機能追加の前）
- （推奨）**毎日 or 週次**の定期バックアップ

### バックアップ保存先の例

- サーバー内: `./backups/prod/`（アクセス制限付き）
- 社内ファイルサーバー（権限管理・監査ログ必須）
- 物理メディア（暗号化）

### 誤操作防止の注意書き

- 実行前に **必ず環境（prod/dev）を声に出して確認**
- `BACKUP_NAME` に **環境名と日付**を含める
- `DROP DATABASE` を実行する前に **二重確認**
- 作業ログ（誰が・いつ・何をしたか）を残す

---

## 参考: 自動化案（任意）

> 手動手順が安定したら、**定期バックアップを自動化**します。

### cron の例（ホスト側）

```bash
# 毎日 2:00 にバックアップ（例）
0 2 * * * /bin/bash -lc 'cd /path/to/knot && BACKUP_DATE=$(date +\%Y\%m\%d) \
  && docker exec -i knot-db pg_dump -U app -d app -F c -f "/tmp/knot-prod-${BACKUP_DATE}.dump" \
  && mkdir -p backups/prod \
  && docker cp "knot-db:/tmp/knot-prod-${BACKUP_DATE}.dump" "./backups/prod/"'
```

### 将来の保存先（例）

- S3 / GCS 等へ **暗号化 + 世代管理**で保存
- 保持期間ポリシー（例: 30日 / 90日）を設定

---

## 付記: よくある失敗と対策

- **バックアップを取ったつもりで空ファイルだった**
  - `ls -lh` でサイズ確認、`pg_restore --list` で中身確認
- **権限エラーで復元できない**
  - 役割差がある場合は `pg_dump --no-owner --no-acl` を検討
- **本番と dev を取り違えた**
  - ディレクトリとファイル名で明確に分離
