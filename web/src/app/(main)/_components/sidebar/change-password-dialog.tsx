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
import { cn } from "@/lib/utils";

// Match the new-password limits in server/auth.go.
const MIN_PASSWORD_CHARACTERS = 12;
const MAX_PASSWORD_BYTES = 72;

function newPasswordIssue(password: string): string {
  if (!password) return "";
  if ([...password].length < MIN_PASSWORD_CHARACTERS) return "New password is too short.";
  if (new TextEncoder().encode(password).length > MAX_PASSWORD_BYTES) return "New password is too long.";
  return "";
}

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
  const lengthIssue = newPasswordIssue(newPassword);
  const passwordsMatch = Boolean(confirmPassword) && confirmPassword === newPassword;
  const confirmationMismatch = Boolean(confirmPassword) && !passwordsMatch;
  const canSubmit = Boolean(oldPassword) && passwordsMatch && !lengthIssue;

  // reset fields whenever the dialog closes
  React.useEffect(() => {
    if (!open) {
      setOldPassword("");
      setNewPassword("");
      setConfirmPassword("");
    }
  }, [open]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit || saving) return;
    setSaving(true);
    api
      .changePassword(oldPassword, newPassword)
      .then(() => {
        toast.success("Password changed");
        onOpenChange(false);
      })
      .catch((err) => toast.error(`Change failed: ${(err as Error).message}`))
      .finally(() => setSaving(false));
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
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
                id="cp-old"
                passwordLabel="current password"
                autoComplete="current-password"
                required
                value={oldPassword}
                disabled={saving}
                onChange={(e) => setOldPassword(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="cp-new">New password</Label>
              <PasswordInput
                id="cp-new"
                passwordLabel="new password"
                autoComplete="new-password"
                required
                aria-describedby="cp-new-requirements cp-new-feedback"
                aria-invalid={Boolean(lengthIssue) || undefined}
                value={newPassword}
                disabled={saving}
                onChange={(e) => setNewPassword(e.target.value)}
              />
              <p id="cp-new-requirements" className="text-muted-foreground text-xs">
                Use at least {MIN_PASSWORD_CHARACTERS} characters and at most {MAX_PASSWORD_BYTES} UTF-8 bytes.
              </p>
              <p
                id="cp-new-feedback"
                role="status"
                className={cn("text-xs", lengthIssue ? "text-destructive" : "text-muted-foreground")}
              >
                {newPassword && (lengthIssue || "Length requirements met.")}
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
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
              <p
                id="cp-confirm-feedback"
                role="status"
                className={cn("text-xs", confirmationMismatch ? "text-destructive" : "text-muted-foreground")}
              >
                {confirmPassword && (confirmationMismatch ? "Passwords do not match." : "Passwords match.")}
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" disabled={!canSubmit || saving}>
              {saving ? "Changing…" : "Confirm change"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
