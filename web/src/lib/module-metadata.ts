import { AllModuleKey } from "./modules";

type ModuleVariant = "default" | "system";

export type ModuleMetadata = {
  description: string;
  badge?: string;
  variant?: ModuleVariant;
};

export const MODULE_METADATA: Record<AllModuleKey, ModuleMetadata> = {
  event: {
    description: "行事の登録とメンバーの出欠を一つに。",
    badge: "イベント / Planning",
  },
  calendar: {
    description: "行事を月間ビューで共有。",
    badge: "共有ビュー / Calendar",
  },
  accounting: {
    description: "経費精算と承認フローをシンプルに。",
    badge: "会計 / Finance",
  },
  management: {
    description:
      "招待や機能ON/OFF、収支内訳書・予算設定を管理するヒューマンモジュール。",
    badge: "組織設定 / Governance",
    variant: "system",
  },
  chat: {
    description:
      "発言そのものを次の行動へつなげる意思決定ハブ。チャットからToDo・会計・議事録へ直接変換します。",
    badge: "意思決定 / ハブ",
  },
  todo: {
    description:
      "会話から生まれたタスクを簡潔に管理。誰が・いつまでに・何をやるかを素早く共有します。",
    badge: "実行 / Action",
  },
  store: {
    description:
      "団体向けモジュールの追加・有効化・無効化をまとめて管理するモジュールストア（管理者専用）。",
    badge: "モジュール管理 / App Store",
    variant: "system",
  },
  document: {
    description:
      "団体の確定版ドキュメントを保管し、年度引き継ぎをシンプルにするモジュールです。",
    badge: "ドキュメント / Archive",
  },
  export: {
    description:
      "イベント出欠表や収支計算書など、各モジュールのデータをCSV・PDFで出力できます。",
    badge: "エクスポート / Export",
  },
  approval: {
    description:
      "備品購入や休暇申請など、団体のあらゆる申請フローを多段階承認で管理します。",
    badge: "承認 / Workflow",
  },
  audit: {
    description:
      "会計・活動の監査を計画し、指摘事項や改善提案を記録できるガバナンスモジュールです。",
    badge: "監査 / Governance",
  },
  "event-budget": {
    description:
      "イベントごとの収入・支出を個別に管理し、本会計に取り込む拡張機能です。",
    badge: "Event / Extension",
  },
};
