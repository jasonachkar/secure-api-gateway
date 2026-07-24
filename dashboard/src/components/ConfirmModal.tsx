/**
 * Generic confirmation modal - replaces window.confirm()/window.prompt() across the app.
 * Supports an optional required "reason" field (used by destructive actions like blocking
 * an IP) and an optional extra `children` slot for contextual preview content (e.g. threat
 * geolocation), so it covers both the plain confirm case and the richer Block-IP case.
 */

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { Button } from './Button';

interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  message?: ReactNode;
  children?: ReactNode;
  reasonLabel?: string;
  reasonMinLength?: number;
  confirmLabel?: string;
  cancelLabel?: string;
  confirmVariant?: 'danger' | 'primary' | 'success';
  onConfirm: (reason?: string) => void;
  onCancel: () => void;
}

export function ConfirmModal({
  isOpen,
  title,
  message,
  children,
  reasonLabel,
  reasonMinLength = 0,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  confirmVariant = 'primary',
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  const [reason, setReason] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  useFocusTrap(containerRef, isOpen);

  useEffect(() => {
    if (isOpen) setReason('');
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onCancel]);

  if (!isOpen) return null;

  const reasonTooShort = Boolean(reasonLabel) && reason.trim().length < reasonMinLength;

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div
        className="modal modal--confirm"
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-modal-title"
        ref={containerRef}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal__header">
          <div className="confirm-modal__title-row">
            {confirmVariant === 'danger' && <AlertTriangle size={20} className="text-danger" aria-hidden="true" />}
            <div id="confirm-modal-title" className="modal__title">
              {title}
            </div>
          </div>
          <button className="modal__close" onClick={onCancel} aria-label="Close dialog">
            ×
          </button>
        </div>

        {message && <div className="section-subtitle confirm-modal__message">{message}</div>}

        {children}

        {reasonLabel && (
          <div className="form-field">
            <label className="form-label" htmlFor="confirm-modal-reason">
              {reasonLabel}
            </label>
            <textarea
              id="confirm-modal-reason"
              className="form-control"
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={reasonMinLength > 0 ? `Minimum ${reasonMinLength} characters` : undefined}
            />
            {reasonMinLength > 0 && (
              <div className="helper-text">
                {reason.trim().length}/{reasonMinLength} characters minimum
              </div>
            )}
          </div>
        )}

        <div className="modal__footer">
          <Button variant="secondary" onClick={onCancel}>
            {cancelLabel}
          </Button>
          <Button
            variant={confirmVariant}
            onClick={() => onConfirm(reasonLabel ? reason.trim() : undefined)}
            disabled={reasonTooShort}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
