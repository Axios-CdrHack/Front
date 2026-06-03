import { useEffect } from "react";
import type { ReactNode } from "react";
import "./Modal.scss";

export function ConfirmModal(props: {
  open: boolean;
  title: string;
  body: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  tone?: "default" | "danger";
  onConfirm(): void;
  onClose(): void;
}) {
  useEffect(() => {
    if (!props.open) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") props.onClose();
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [props.open, props.onClose]);

  if (!props.open) return null;

  return (
    <div className="modal-backdrop" role="presentation">
      <section className="confirm-modal" role="dialog" aria-modal="true" aria-labelledby="confirm-modal-title">
        <h2 id="confirm-modal-title">{props.title}</h2>
        <div className="confirm-modal-body">{props.body}</div>
        <div className="confirm-modal-actions">
          <button className="modal-secondary" type="button" onClick={props.onClose}>
            {props.cancelLabel ?? "Cancel"}
          </button>
          <button className={props.tone === "danger" ? "modal-danger" : "modal-primary"} type="button" onClick={props.onConfirm}>
            {props.confirmLabel}
          </button>
        </div>
      </section>
    </div>
  );
}
