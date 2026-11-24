import { useEffect } from "react";
import { AlertTriangle, X } from "lucide-react";

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  busy?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  busy = false,
  onCancel,
  onConfirm,
}: ConfirmDialogProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div className="overlay-backdrop" role="presentation" onClick={onCancel}>
      <div
        className="modal-panel modal-sm"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        aria-describedby="confirm-desc"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="overlay-header">
          <div className="overlay-title-group is-danger">
            <AlertTriangle size={18} aria-hidden="true" />
            <h2 id="confirm-title" className="overlay-title">
              {title}
            </h2>
          </div>
          <button
            type="button"
            className="btn btn-tertiary btn-sm icon-btn"
            onClick={onCancel}
            aria-label="取消"
          >
            <X size={16} />
          </button>
        </header>

        <div className="modal-body">
          <p id="confirm-desc" className="confirm-desc">
            {description}
          </p>
          <footer className="modal-footer">
            <div />
            <div className="modal-footer-right">
              <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={busy}>
                取消
              </button>
              <button
                type="button"
                className="btn btn-danger-solid"
                onClick={onConfirm}
                disabled={busy}
              >
                {busy ? "处理中…" : confirmLabel}
              </button>
            </div>
          </footer>
        </div>
      </div>
    </div>
  );
}
