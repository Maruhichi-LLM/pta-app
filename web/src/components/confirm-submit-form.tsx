"use client";

import {
  FormEvent,
  FormHTMLAttributes,
  ReactNode,
  useRef,
  useState,
} from "react";

type ConfirmSubmitFormProps = FormHTMLAttributes<HTMLFormElement> & {
  title?: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  confirmContent?: ReactNode;
};

export function ConfirmSubmitForm({
  title = "確認",
  message = "この内容で送信しますか？",
  confirmLabel = "送信する",
  cancelLabel = "キャンセル",
  confirmContent,
  children,
  onSubmit,
  ...rest
}: ConfirmSubmitFormProps) {
  const formRef = useRef<HTMLFormElement | null>(null);
  const [showDialog, setShowDialog] = useState(false);
  const skipConfirmRef = useRef(false);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    if (skipConfirmRef.current) {
      skipConfirmRef.current = false;
      onSubmit?.(event);
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    setShowDialog(true);
    onSubmit?.(event);
  }

  function closeDialog() {
    setShowDialog(false);
  }

  function confirmAndSubmit() {
    setShowDialog(false);
    skipConfirmRef.current = true;
    formRef.current?.requestSubmit();
  }

  return (
    <>
      <form ref={formRef} {...rest} onSubmit={handleSubmit}>
        {children as ReactNode}
      </form>
      {showDialog ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 px-4 py-6">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl">
            <h3 className="text-lg font-semibold text-zinc-900">{title}</h3>
            {confirmContent ? (
              <div className="mt-2">{confirmContent}</div>
            ) : (
              <p className="mt-2 text-sm text-zinc-600">{message}</p>
            )}
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={closeDialog}
                className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-50"
              >
                {cancelLabel}
              </button>
              <button
                type="button"
                onClick={confirmAndSubmit}
                className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-sky-700"
              >
                {confirmLabel}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
