"use client";

import * as React from "react";

import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/ui/password-input";
import { api } from "@/lib/api";
import { getNewPasswordFeedback, NEW_PASSWORD_REQUIREMENTS } from "@/lib/new-password";
import { cn } from "@/lib/utils";

const WRONG_CURRENT_PASSWORD = "Current password is wrong";
const SAFE_SERVER_ERRORS = new Set([
  WRONG_CURRENT_PASSWORD,
  "Data source temporarily unavailable, please retry later",
  "management console data source (PostgreSQL) is not connected",
  "Invalid request format",
  "New password cannot be empty",
  "Password must be at least 12 characters",
  "Password must not exceed 72 bytes",
  "Password not initialized; set a password first",
  "Password encryption failed",
  "Could not save the password. Please try again.",
]);

export function ChangePasswordDialog({
  open,
  onOpenChange,
}: {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}) {
  const [oldPassword, setOldPassword] = React.useState("");
  const [newPassword, setNewPassword] = React.useState("");
  const [confirmPassword, setConfirmPassword] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [submissionError, setSubmissionError] = React.useState("");
  const dialogVersion = React.useRef(0);
  const currentPasswordInput = React.useRef<HTMLInputElement>(null);
  const submitButton = React.useRef<HTMLButtonElement>(null);
  const { isValid, lengthInvalid, confirmationMismatch, lengthMessage, confirmationMessage } = getNewPasswordFeedback(
    newPassword,
    confirmPassword,
  );
  const canSubmit = Boolean(oldPassword) && isValid;
  const wrongPassword = submissionError === WRONG_CURRENT_PASSWORD;
  const submitLabel = submissionError ? "Retry change" : "Confirm change";

  React.useLayoutEffect(() => {
    if (!open) {
      setOldPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setSubmissionError("");
    }
    return () => {
      dialogVersion.current++;
    };
  }, [open]);

  React.useEffect(() => {
    if (!open || saving || !submissionError) return;
    if (wrongPassword) currentPasswordInput.current?.focus();
    else submitButton.current?.focus();
  }, [open, saving, submissionError, wrongPassword]);

  function handleOpenChange(next: boolean) {
    if (!next) dialogVersion.current++;
    onOpenChange(next);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit || saving) return;
    const version = dialogVersion.current;
    setSaving(true);
    setSubmissionError("");
    try {
      await api.changePassword(oldPassword, newPassword);
      if (version !== dialogVersion.current) return;
      toast.success("Password changed");
      handleOpenChange(false);
    } catch (error) {
      if (version !== dialogVersion.current) return;
      const message = error instanceof Error ? error.message : "";
      if (message === "Unauthorized") return;
      setSubmissionError(
        SAFE_SERVER_ERRORS.has(message) ? message : "Unable to change the password. Please try again.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>Change password</DialogTitle>
            <DialogDescription>
              The username is fixed as <b>SUPERARTEX</b>. Enter the current password to verify; login tokens issued
              before the change stay valid until they expire.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3 py-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="cp-old">Current password</Label>
              <PasswordInput
                ref={currentPasswordInput}
                id="cp-old"
                passwordLabel="current password"
                autoComplete="current-password"
                required
                aria-describedby={wrongPassword ? "cp-current-error" : undefined}
                aria-invalid={wrongPassword || undefined}
                value={oldPassword}
                disabled={saving}
                onChange={(e) => {
                  setOldPassword(e.target.value);
                  setSubmissionError("");
                }}
              />
              {wrongPassword && (
                <p id="cp-current-error" role="alert" className="text-destructive text-xs">
                  {submissionError}
                </p>
              )}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="cp-new">New password</Label>
              <PasswordInput
                id="cp-new"
                passwordLabel="new password"
                autoComplete="new-password"
                required
                aria-describedby="cp-new-requirements cp-new-feedback"
                aria-invalid={lengthInvalid || undefined}
                value={newPassword}
                disabled={saving}
                onChange={(e) => {
                  setNewPassword(e.target.value);
                  if (!wrongPassword) setSubmissionError("");
                }}
              />
              <p id="cp-new-requirements" className="text-muted-foreground text-xs">
                {NEW_PASSWORD_REQUIREMENTS}
              </p>
              <p
                id="cp-new-feedback"
                role="status"
                className={cn("text-xs", lengthInvalid ? "text-destructive" : "text-muted-foreground")}
              >
                {lengthMessage}
              </p>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="cp-confirm">Confirm new password</Label>
              <PasswordInput
                id="cp-confirm"
                passwordLabel="new password confirmation"
                autoComplete="new-password"
                required
                aria-describedby="cp-confirm-feedback"
                aria-invalid={confirmationMismatch || undefined}
                value={confirmPassword}
                disabled={saving}
                onChange={(e) => {
                  setConfirmPassword(e.target.value);
                  if (!wrongPassword) setSubmissionError("");
                }}
              />
              <p
                id="cp-confirm-feedback"
                role="status"
                className={cn("text-xs", confirmationMismatch ? "text-destructive" : "text-muted-foreground")}
              >
                {confirmationMessage}
              </p>
            </div>
          </div>
          {submissionError && !wrongPassword && (
            <p role="alert" className="mb-4 text-destructive text-sm">
              {submissionError}
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => handleOpenChange(false)} disabled={saving}>
              Cancel
            </Button>
            <Button ref={submitButton} type="submit" disabled={!canSubmit || saving}>
              {saving ? "Changing…" : submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
