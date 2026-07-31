"use client";

import { useEffect, useId, useState, type ReactNode } from "react";

import { TrashIcon, XIcon } from "@/components/ui/Icons";

export function DeleteConfirmationDialog({
  confirmLabel,
  confirmationText,
  description,
  onClose,
  onConfirm,
  pendingLabel,
  title,
}: {
  confirmLabel: string;
  confirmationText?: string;
  description: ReactNode;
  onClose: () => void;
  onConfirm: () => Promise<string | null>;
  pendingLabel: string;
  title: string;
}) {
  const titleId = useId();
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const confirmed =
    confirmationText === undefined || confirmation === confirmationText;

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !pending) onClose();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose, pending]);

  const confirm = async () => {
    if (!confirmed || pending) return;
    setPending(true);
    setError("");
    const nextError = await onConfirm();
    if (nextError) {
      setError(nextError);
      setPending(false);
      return;
    }
    onClose();
  };

  return (
    <div
      className="dialog-backdrop"
      onMouseDown={() => !pending && onClose()}
      role="presentation"
    >
      <section
        aria-labelledby={titleId}
        aria-modal="true"
        className="confirmation-dialog"
        onMouseDown={(event) => event.stopPropagation()}
        role="dialog"
      >
        <button
          aria-label="Close delete confirmation"
          className="dialog-close"
          disabled={pending}
          onClick={onClose}
          type="button"
        >
          <XIcon />
        </button>
        <span className="form-icon danger-icon">
          <TrashIcon />
        </span>
        <p className="eyebrow">Permanent action</p>
        <h2 id={titleId}>{title}</h2>
        <p>{description}</p>
        {confirmationText !== undefined ? (
          <label className="field-group">
            <span className="field-label">
              Type <strong>{confirmationText}</strong> to confirm
            </span>
            <input
              autoComplete="off"
              autoFocus
              className="field"
              onChange={(event) => {
                setConfirmation(event.target.value);
                setError("");
              }}
              value={confirmation}
            />
          </label>
        ) : null}
        {error ? (
          <p className="form-message" role="alert">
            {error}
          </p>
        ) : null}
        <div className="dialog-actions">
          <button
            className="button-secondary"
            disabled={pending}
            onClick={onClose}
            type="button"
          >
            Cancel
          </button>
          <button
            className="button-primary button-danger"
            disabled={!confirmed || pending}
            onClick={() => void confirm()}
            type="button"
          >
            {pending ? pendingLabel : confirmLabel}
          </button>
        </div>
      </section>
    </div>
  );
}
