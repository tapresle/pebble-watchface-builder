/** A yes/no dialog, in place of window.confirm(). */

import type { ReactNode } from 'react';
import { Modal, ModalBody, ModalFooter, ModalHeader } from './Modal';

export interface ConfirmDialogProps {
  title: string;
  children: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  tone?: 'default' | 'danger';
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  title,
  children,
  confirmLabel,
  cancelLabel = 'Cancel',
  tone = 'default',
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <Modal size="sm" label={title} onClose={onCancel}>
      <ModalHeader title={title} />
      <ModalBody>
        <div className="dialog-text">{children}</div>
      </ModalBody>
      <ModalFooter>
        <button type="button" className="btn" onClick={onCancel}>
          {cancelLabel}
        </button>
        <button
          type="button"
          className={tone === 'danger' ? 'btn btn-destructive' : 'btn btn-primary'}
          onClick={onConfirm}
        >
          {confirmLabel}
        </button>
      </ModalFooter>
    </Modal>
  );
}
