import { type ReactNode, useId, useLayoutEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "./Button";

type ConfirmDialogProps = {
  open: boolean;
  title: string;
  children?: ReactNode;
  confirmLabel: string;
  danger?: boolean;
  canConfirm?: boolean;
  pending: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

export function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel,
  danger = false,
  canConfirm = true,
  pending,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const { t } = useTranslation();
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  // Before paint, so a dialog closing never shows a frame with its contents already gone.
  useLayoutEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (open && !element.open) element.showModal();
    if (!open && element.open) element.close();
  }, [open]);

  return (
    <dialog
      ref={dialog}
      aria-labelledby={titleId}
      // Escape closes a dialog on its own; leaving it to onCancel keeps `open` the one truth.
      onCancel={(event) => {
        event.preventDefault();
        onCancel();
      }}
      onClose={() => open && onCancel()}
      className="m-auto w-[min(28rem,calc(100%-2rem))] rounded-2xl bg-white p-5 text-zinc-900 shadow-xl backdrop:bg-black/40 dark:bg-zinc-900 dark:text-zinc-100"
    >
      {open && (
        <div className="flex flex-col gap-4">
          <h2 id={titleId} className="text-lg font-semibold">
            {title}
          </h2>
          {children}
          <div className="flex flex-wrap justify-end gap-3">
            <Button variant="secondary" onClick={onCancel}>
              {t("dialog.cancel")}
            </Button>
            <Button
              variant={danger ? "danger" : "primary"}
              disabled={!canConfirm || pending}
              onClick={onConfirm}
            >
              {confirmLabel}
            </Button>
          </div>
        </div>
      )}
    </dialog>
  );
}
