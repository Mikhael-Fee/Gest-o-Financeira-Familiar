import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
import { keepDialogFocus } from "./dialogFocus";
export default function AccessibleDialog({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (open && !ref.current?.open) ref.current?.showModal();
    else if (!open && ref.current?.open) ref.current.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      aria-label={title}
      onKeyDown={keepDialogFocus}
      onCancel={onClose}
      onClose={onClose}
      onClick={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        if (
          e.target === e.currentTarget &&
          (e.clientX < r.left ||
            e.clientX > r.right ||
            e.clientY < r.top ||
            e.clientY > r.bottom)
        )
          onClose();
      }}
    >
      <div className="dialog-heading">
        <h2>{title}</h2>
        <button
          className="icon-button"
          aria-label={`Fechar ${title.toLowerCase()}`}
          onClick={onClose}
        >
          <X />
        </button>
      </div>
      {children}
    </dialog>
  );
}
