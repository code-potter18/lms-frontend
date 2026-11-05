import type { ReactNode } from "react";

export type ConfirmationDialogType =
  | "warning"
  | "danger"
  | "info"
  | "success"
  | "question"
  | "lock"
  | "LockOpen";

export interface ConfirmationDialogProps {
  open: boolean;
  title: string;
  description: ReactNode;
  type?: ConfirmationDialogType;
  confirmText?: string;
  cancelText?: string;
  hideCancelButton?: boolean;
  loading?: boolean;
  showCloseButton?: boolean;
  closeOnBackdrop?: boolean;
  closeOnEscape?: boolean;
  // Overrides the default `max-w-md` content width — useful for forms that
  // need more horizontal room (e.g. the assign/re-assign slot dialog).
  maxWidth?: string;
  // Replaces the default Cancel/Confirm button row entirely (e.g. a custom
  // "OK / Home" footer after the action has completed).
  footer?: ReactNode;
  children?: ReactNode;
  onConfirm: () => void;
  onCancel: () => void;
}

export interface ConfirmationDialogTypeConfig {
  icon: ReactNode;
  iconContainerClass: string;
  confirmButtonClass: string;
}