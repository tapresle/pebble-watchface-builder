/**
 * The one modal shell in the app. Handles the backdrop, Escape, and initial
 * focus, so nothing has to reach for window.confirm().
 */

import { CloseIcon } from './icons';
import { useEffect, useRef, type ReactNode } from 'react';

export type ModalSize = 'sm' | 'md' | 'lg';

interface ModalProps {
  /** Omit to make the dialog non-dismissible - no Escape, no backdrop click. */
  onClose?: () => void;
  size?: ModalSize;
  label: string;
  children: ReactNode;
}

export function Modal({ onClose, size = 'md', label, children }: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    panelRef.current?.focus();
    if (!onClose) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (onClose && e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        className="modal"
        data-size={size}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
      >
        {children}
      </div>
    </div>
  );
}

export function ModalHeader({
  title,
  subtitle,
  onClose,
  children,
}: {
  title: string;
  subtitle?: ReactNode;
  onClose?: () => void;
  /** Extra controls rendered on the right of the title. */
  children?: ReactNode;
}) {
  return (
    <div className="modal-header">
      <div className="modal-heading">
        <span className="modal-title">{title}</span>
        {subtitle && <span className="modal-subtitle">{subtitle}</span>}
      </div>
      {children}
      {onClose && (
        <button type="button" className="btn btn-ghost btn-icon" onClick={onClose} title="Close">
          <CloseIcon />
        </button>
      )}
    </div>
  );
}

export function ModalBody({ children, padded = true }: { children: ReactNode; padded?: boolean }) {
  return <div className={padded ? 'modal-body modal-body-padded' : 'modal-body'}>{children}</div>;
}

export function ModalFooter({ children }: { children: ReactNode }) {
  return <div className="modal-footer">{children}</div>;
}
