import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import {
  X,
  AlertTriangle,
  Info,
  AlertCircle,
  Lock,
  HelpCircle,
  CheckCircle,
  LockOpen,
  Loader2,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";

import {
  ConfirmationDialogProps,
  ConfirmationDialogType,
  ConfirmationDialogTypeConfig,
} from "./confirmation-dialog.types";

const TYPE_CONFIG: Record<ConfirmationDialogType, ConfirmationDialogTypeConfig> = {
  warning: {
    icon: <AlertTriangle className="h-5 w-5" />,
    iconContainerClass: "bg-red-100 text-red-600",
    confirmButtonClass: "bg-red-600 text-white hover:bg-red-700",
  },
  danger: {
    icon: <AlertCircle className="h-5 w-5" />,
    iconContainerClass: "bg-red-100 text-red-600",
    confirmButtonClass: "bg-red-600 text-white hover:bg-red-700",
  },
  info: {
    icon: <Info className="h-5 w-5" />,
    iconContainerClass: "bg-blue-100 text-blue-600",
    confirmButtonClass: "bg-blue-600 text-white hover:bg-blue-700",
  },
  success: {
    icon: <CheckCircle className="h-5 w-5" />,
    iconContainerClass: "bg-green-100 text-green-600",
    confirmButtonClass: "bg-green-600 text-white hover:bg-green-700",
  },
  question: {
    icon: <HelpCircle className="h-5 w-5" />,
    iconContainerClass: "bg-gray-100 text-gray-600",
    confirmButtonClass: "bg-gray-600 text-white hover:bg-gray-700",
  },
  lock: {
    icon: <Lock className="h-5 w-5" />,
    iconContainerClass: "bg-orange-100 text-orange-600",
    confirmButtonClass: "bg-orange-600 text-white hover:bg-orange-700",
  },
  LockOpen: {
    icon: <LockOpen className="h-5 w-5" />,
    iconContainerClass: "bg-green-100 text-green-600",
    confirmButtonClass: "bg-green-600 text-white hover:bg-green-700",
  },
};

const DEFAULT_CONFIRM_TEXT: Record<ConfirmationDialogType, string> = {
  warning: "Confirm",
  danger: "Delete",
  info: "Continue",
  success: "Confirm",
  question: "Yes",
  lock: "Reset",
  LockOpen: "Unlock",
};

const DEFAULT_CANCEL_TEXT = "Cancel";

function ConfirmationDialog({
  open,
  title,
  description,
  type = "question",
  confirmText,
  cancelText,
  hideCancelButton = false,
  loading = false,
  showCloseButton = true,
  closeOnBackdrop = true,
  closeOnEscape = true,
  maxWidth = "max-w-md",
  footer,
  children,
  onConfirm,
  onCancel,
}: ConfirmationDialogProps) {
  const config = TYPE_CONFIG[type];

  const handleConfirm = () => {
    if (!loading) onConfirm();
  };

  return (
    <DialogPrimitive.Root open={open} onOpenChange={(nextOpen) => {
      if (!nextOpen) onCancel();
    }}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 hms-modal-overlay data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content
className={cn(
  "fixed left-[50%] top-[50%] z-50 w-full translate-x-[-50%] translate-y-[-50%] gap-4 border bg-background p-6 shadow-xl duration-200 hms-modal-content data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%] sm:rounded-xl",
  maxWidth,
)}
          onEscapeKeyDown={(event) => {
            if (!closeOnEscape) event.preventDefault();
          }}
          onPointerDownOutside={(event) => {
            if (!closeOnBackdrop) event.preventDefault();
          }}
          onInteractOutside={(event) => {
            if (!closeOnBackdrop) event.preventDefault();
          }}
        >
          <div className="flex flex-col items-center text-center gap-4">
            <div
              className={cn(
                "flex h-12 w-12 items-center justify-center rounded-full",
                config.iconContainerClass,
              )}
            >
              {config.icon}
            </div>

            <div className="space-y-2">
              <DialogPrimitive.Title className="text-lg font-semibold leading-none tracking-tight">
                {title}
              </DialogPrimitive.Title>
              <DialogPrimitive.Description className="text-sm text-muted-foreground">
                {description}
              </DialogPrimitive.Description>
            </div>

            {children}

            {showCloseButton && (
              <DialogPrimitive.Close
                onClick={onCancel}
                disabled={loading}
                className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none"
              >
                <X className="h-4 w-4" />
                <span className="sr-only">Close</span>
              </DialogPrimitive.Close>
            )}

            {footer ? (
              footer
            ) : (
              <div className="flex w-full flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                {!hideCancelButton && (
                  <button
                    type="button"
                    onClick={onCancel}
                    disabled={loading}
                    className={cn(buttonVariants({ variant: "outline" }))}
                  >
                    {cancelText ?? DEFAULT_CANCEL_TEXT}
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleConfirm}
                  disabled={loading}
                  className={cn(
                    buttonVariants({ variant: "default" }),
                    config.confirmButtonClass,
                    "gap-2",
                  )}
                >
                  {loading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Confirming...
                    </>
                  ) : (
                    confirmText ?? DEFAULT_CONFIRM_TEXT[type]
                  )}
                </button>
              </div>
            )}
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

ConfirmationDialog.displayName = "ConfirmationDialog";

export { ConfirmationDialog };
