import { useEffect, useRef, type KeyboardEvent, type MouseEvent, type PropsWithChildren, type RefObject } from "react";

type ModalProps = PropsWithChildren<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
  titleId: string;
  descriptionId?: string;
  triggerRef: RefObject<HTMLElement | null>;
}>;

const focusableSelector = "button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])";

export function Modal({ open, onOpenChange, titleId, descriptionId, triggerRef, children }: ModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    if (!open) return;
    const dialog = dialogRef.current;
    const first = dialog?.querySelector<HTMLElement>(focusableSelector);
    first?.focus();
    return () => triggerRef.current?.focus();
  }, [open, triggerRef]);

  if (!open) return null;

  function handleKeyDown(event: KeyboardEvent<HTMLDialogElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      onOpenChange(false);
      return;
    }
    if (event.key !== "Tab") return;
    const items = Array.from(event.currentTarget.querySelectorAll<HTMLElement>(focusableSelector));
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function handleBackdrop(event: MouseEvent<HTMLDialogElement>) {
    if (event.target === event.currentTarget) onOpenChange(false);
  }

  return (
    <dialog
      ref={dialogRef}
      open
      className="modal"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      onKeyDown={handleKeyDown}
      onMouseDown={handleBackdrop}
      onCancel={(event) => { event.preventDefault(); onOpenChange(false); }}
    >
      {children}
    </dialog>
  );
}
