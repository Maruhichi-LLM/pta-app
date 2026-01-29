export type ApprovalFieldType =
  | "text"
  | "textarea"
  | "number"
  | "date"
  | "select"
  | "multiSelect"
  | "file"
  | "checkbox";

export type ApprovalFieldOption = {
  label: string;
  value: string;
};

export type ApprovalFieldDefinition = {
  id: string;
  label: string;
  type: ApprovalFieldType;
  required?: boolean;
  placeholder?: string;
  helpText?: string;
  options?: ApprovalFieldOption[];
  defaultValue?: string | number | boolean | string[] | null;
  min?: number;
  max?: number;
};

export type ApprovalFormSchema = {
  items: ApprovalFieldDefinition[];
  instructions?: string;
  version?: number;
};

export type ApprovalFormValue = string | number | boolean | string[] | null;

export type ApprovalFormValues = Record<string, ApprovalFormValue>;

export const DEFAULT_APPROVAL_FORM_SCHEMA: ApprovalFormSchema = {
  items: [
    {
      id: "purpose",
      label: "目的",
      type: "text",
      required: true,
      placeholder: "例: 備品購入の目的",
    },
    {
      id: "amount",
      label: "金額",
      type: "number",
      required: false,
      placeholder: "例: 10000",
      min: 0,
    },
    {
      id: "attachment",
      label: "添付資料",
      type: "file",
      required: false,
    },
    {
      id: "neededBy",
      label: "希望日",
      type: "date",
      required: false,
    },
    {
      id: "details",
      label: "詳細",
      type: "textarea",
      required: false,
      placeholder: "補足や背景など",
    },
  ],
};

const ALLOWED_TYPES: ApprovalFieldType[] = [
  "text",
  "textarea",
  "number",
  "date",
  "select",
  "multiSelect",
  "file",
  "checkbox",
];

export function parseApprovalFormSchema(value: unknown): ApprovalFormSchema {
  if (!value || typeof value !== "object") {
    throw new Error("fields はオブジェクト形式で指定してください。");
  }

  const schema = value as Record<string, unknown>;
  const rawItems = schema.items;
  if (!Array.isArray(rawItems)) {
    throw new Error("fields.items は配列である必要があります。");
  }

  const seenIds = new Set<string>();
  const items: ApprovalFieldDefinition[] = rawItems.map((item, index) => {
    if (!item || typeof item !== "object") {
      throw new Error(`fields.items[${index}] が不正です。`);
    }
    const record = item as Record<string, unknown>;
    if (typeof record.id !== "string" || record.id.trim().length === 0) {
      throw new Error(`fields.items[${index}] の id を設定してください。`);
    }
    const id = record.id.trim();
    if (!/^[-_a-zA-Z0-9]+$/.test(id)) {
      throw new Error(
        `fields.items[${index}] の id は英数字・ハイフン・アンダースコアのみ利用できます。`
      );
    }
    if (seenIds.has(id)) {
      throw new Error(`fields.items の id '${id}' が重複しています。`);
    }
    seenIds.add(id);

    if (typeof record.label !== "string" || record.label.trim().length === 0) {
      throw new Error(`fields.items[${index}] の label を設定してください。`);
    }
    const label = record.label.trim();

    if (typeof record.type !== "string") {
      throw new Error(`fields.items[${index}] の type を設定してください。`);
    }
    const type = record.type.trim() as ApprovalFieldType;
    if (!ALLOWED_TYPES.includes(type)) {
      throw new Error(
        `fields.items[${index}] の type '${record.type}' はサポートされていません。`
      );
    }

    let options: ApprovalFieldOption[] | undefined;
    if (type === "select" || type === "multiSelect") {
      if (!Array.isArray(record.options) || record.options.length === 0) {
        throw new Error(
          `fields.items[${index}] (type: ${type}) は options を1件以上指定してください。`
        );
      }
      options = record.options.map((option, optionIndex) => {
        if (!option || typeof option !== "object") {
          throw new Error(
            `fields.items[${index}] の options[${optionIndex}] が不正です。`
          );
        }
        const optionRecord = option as Record<string, unknown>;
        if (
          typeof optionRecord.label !== "string" ||
          optionRecord.label.trim().length === 0
        ) {
          throw new Error(
            `fields.items[${index}] の options[${optionIndex}] の label を設定してください。`
          );
        }
        if (
          typeof optionRecord.value !== "string" ||
          optionRecord.value.trim().length === 0
        ) {
          throw new Error(
            `fields.items[${index}] の options[${optionIndex}] の value を設定してください。`
          );
        }
        return {
          label: optionRecord.label.trim(),
          value: optionRecord.value.trim(),
        };
      });
    }

    const definition: ApprovalFieldDefinition = {
      id,
      label,
      type,
      required:
        typeof record.required === "boolean" ? record.required : undefined,
      placeholder:
        typeof record.placeholder === "string"
          ? record.placeholder
          : undefined,
      helpText:
        typeof record.helpText === "string" ? record.helpText : undefined,
      options,
    };

    if (typeof record.defaultValue !== "undefined") {
      definition.defaultValue = record.defaultValue as
        | string
        | number
        | boolean
        | string[]
        | null;
    }

    if (typeof record.min === "number") {
      definition.min = record.min;
    }
    if (typeof record.max === "number") {
      definition.max = record.max;
    }

    return definition;
  });

  if (items.length === 0) {
    throw new Error("fields.items に少なくとも1つの項目を定義してください。");
  }

  return {
    items,
    instructions:
      typeof schema.instructions === "string"
        ? schema.instructions.trim()
        : undefined,
    version:
      typeof schema.version === "number" ? schema.version : undefined,
  };
}

export function buildInitialValues(schema: ApprovalFormSchema): ApprovalFormValues {
  return schema.items.reduce<ApprovalFormValues>((acc, field) => {
    if (typeof field.defaultValue !== "undefined") {
      acc[field.id] = field.defaultValue;
      return acc;
    }
    switch (field.type) {
      case "checkbox":
        acc[field.id] = false;
        break;
      case "multiSelect":
        acc[field.id] = [];
        break;
      default:
        acc[field.id] = null;
    }
    return acc;
  }, {});
}

export function validateApprovalFormData(
  schema: ApprovalFormSchema,
  value: unknown
): { errors: string[]; cleaned: ApprovalFormValues } {
  const errors: string[] = [];
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {
      errors: ["申請データはオブジェクト形式で指定してください。"],
      cleaned: {},
    };
  }
  const record = value as Record<string, unknown>;
  const cleaned: ApprovalFormValues = {};

  for (const field of schema.items) {
    const rawValue = record[field.id];
    const result = normalizeFieldValue(field, rawValue);
    if (!result.ok) {
      errors.push(result.error);
      continue;
    }
    cleaned[field.id] = result.value;
    if (field.required && isEmpty(result.value)) {
      errors.push(`${field.label} を入力してください。`);
    }
  }

  return { errors, cleaned };
}

function normalizeFieldValue(
  field: ApprovalFieldDefinition,
  rawValue: unknown
): { ok: true; value: ApprovalFormValue } | { ok: false; value: null; error: string } {
  switch (field.type) {
    case "number": {
      if (rawValue === undefined || rawValue === null || rawValue === "") {
        return { ok: true, value: null };
      }
      const num = Number(rawValue);
      if (!Number.isFinite(num)) {
        return { ok: false, value: null, error: `${field.label} は数値で入力してください。` };
      }
      if (typeof field.min === "number" && num < field.min) {
        return {
          ok: false,
          value: null,
          error: `${field.label} は ${field.min} 以上で入力してください。`,
        };
      }
      if (typeof field.max === "number" && num > field.max) {
        return {
          ok: false,
          value: null,
          error: `${field.label} は ${field.max} 以下で入力してください。`,
        };
      }
      return { ok: true, value: num };
    }
    case "date": {
      if (rawValue === undefined || rawValue === null || rawValue === "") {
        return { ok: true, value: null };
      }
      if (typeof rawValue !== "string") {
        return { ok: false, value: null, error: `${field.label} は日付形式で入力してください。` };
      }
      const trimmed = rawValue.trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
        return { ok: false, value: null, error: `${field.label} は YYYY-MM-DD 形式で入力してください。` };
      }
      return { ok: true, value: trimmed };
    }
    case "select": {
      if (rawValue === undefined || rawValue === null || rawValue === "") {
        return { ok: true, value: null };
      }
      if (typeof rawValue !== "string") {
        return { ok: false, value: null, error: `${field.label} を選択してください。` };
      }
      if (field.options && !field.options.some((option) => option.value === rawValue)) {
        return { ok: false, value: null, error: `${field.label} の選択肢が不正です。` };
      }
      return { ok: true, value: rawValue };
    }
    case "multiSelect": {
      if (rawValue === undefined || rawValue === null) {
        return { ok: true, value: [] };
      }
      const arr = Array.isArray(rawValue) ? rawValue : [rawValue];
      const values: string[] = [];
      for (const item of arr) {
        if (typeof item !== "string") {
          return { ok: false, value: null, error: `${field.label} の値が不正です。` };
        }
        if (field.options && !field.options.some((option) => option.value === item)) {
          return { ok: false, value: null, error: `${field.label} の選択肢が不正です。` };
        }
        values.push(item);
      }
      return { ok: true, value: Array.from(new Set(values)) };
    }
    case "checkbox": {
      if (rawValue === undefined || rawValue === null) {
        return { ok: true, value: false };
      }
      if (typeof rawValue === "boolean") {
        return { ok: true, value: rawValue };
      }
      if (rawValue === "true" || rawValue === "1") {
        return { ok: true, value: true };
      }
      if (rawValue === "false" || rawValue === "0") {
        return { ok: true, value: false };
      }
      return { ok: false, value: null, error: `${field.label} の値が不正です。` };
    }
    default: {
      if (rawValue === undefined || rawValue === null) {
        return { ok: true, value: null };
      }
      if (typeof rawValue !== "string") {
        return { ok: false, value: null, error: `${field.label} を文字列で入力してください。` };
      }
      const trimmed = rawValue.trim();
      if (field.type === "file" && trimmed.length === 0) {
        return { ok: true, value: null };
      }
      return { ok: true, value: trimmed };
    }
  }
}

function isEmpty(value: ApprovalFormValue) {
  if (value === null) return true;
  if (value === "") return true;
  if (Array.isArray(value)) return value.length === 0;
  return false;
}
