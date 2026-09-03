"use client";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

/**
 * Destructive confirmation. Call sites mount it conditionally, so it opens as soon
 * as it renders and reports every dismissal path — Escape, the overlay, Cancel —
 * through onCancel.
 */
export function ConfirmModal({
  title,
  description,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
  // Most confirmations guard a destructive action (delete). Restore is the
  // one call site that isn't -- append-only and free, per CLAUDE.md -- so it
  // opts into the neutral primary treatment instead of sharing delete's red.
  variant = "destructiveOutline",
}: {
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  variant?: "destructiveOutline" | "default";
}) {
  return (
    <AlertDialog
      open
      onOpenChange={(next) => {
        if (!next) onCancel();
      }}
    >
      <AlertDialogContent size="sm">
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel size="sm" onClick={onCancel}>
            {cancelLabel}
          </AlertDialogCancel>
          <AlertDialogAction size="sm" variant={variant} onClick={onConfirm}>
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
