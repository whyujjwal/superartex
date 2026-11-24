"use client";

import { useEffect, useState } from "react";

import { useRouter } from "next/navigation";

import { ArrowRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/ui/password-input";
import { api } from "@/lib/api";
import { auth } from "@/lib/auth";
import { getNewPasswordFeedback, NEW_PASSWORD_REQUIREMENTS } from "@/lib/new-password";
import { cn } from "@/lib/utils";

import styles from "../auth.module.css";

export default function SetupPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [setupToken, setSetupToken] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  // when the initialization state cannot be fetched, do not default to "not initialized" — that would show the setup form to an
  // instance that already has a password, and following it would overwrite the original. Close the entrance instead.
  const [unavailable, setUnavailable] = useState(false);
  const { isValid, lengthInvalid, confirmationMismatch, lengthMessage, confirmationMessage } = getNewPasswordFeedback(
    password,
    confirm,
  );
  const trimmedSetupToken = setupToken.trim();
  const canSubmit = Boolean(trimmedSetupToken) && isValid;

  useEffect(() => {
    api
      .authStatus()
      .then(({ initialized }) => {
        if (initialized) router.replace("/login");
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Unable to connect to the backend service");
        setUnavailable(true);
      })
      .finally(() => setChecking(false));
  }, [router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit || loading) return;
    setLoading(true);
    setError("");
    try {
      const { token } = await api.initPassword(password, trimmedSetupToken);
      auth.setToken(token);
      router.replace("/function/tasks");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Initialization failed");
    } finally {
      setLoading(false);
    }
  }

  if (checking) {
    return (
      <p role="status" className="text-muted-foreground text-sm">
        Checking setup state…
      </p>
    );
  }

  return (
    <>
      <header className={styles.intro}>
        <h1 className={styles.title}>{unavailable ? "Cannot confirm initialization state" : "Set initial password"}</h1>
        <p className="text-muted-foreground text-sm leading-relaxed">
          {unavailable
            ? "The backend or database is temporarily unavailable. To avoid overwriting a password already set on this instance, setup is temporarily closed — restore the service and try again."
            : "Use the setup token from the server log."}
        </p>
      </header>
      {unavailable ? (
        <div className="flex flex-col gap-5">
          {error && (
            <p role="alert" className="text-destructive text-sm">
              {error}
            </p>
          )}
          <Button type="button" className="h-11 w-full" onClick={() => window.location.reload()}>
            Retry
          </Button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          <div className="space-y-2">
            <Label htmlFor="setup-token">Setup token</Label>
            <PasswordInput
              id="setup-token"
              passwordLabel="setup token"
              value={setupToken}
              onChange={(e) => setSetupToken(e.target.value)}
              autoFocus
              autoComplete="off"
              required
              className="h-11 bg-card"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">New password</Label>
            <PasswordInput
              id="password"
              passwordLabel="new password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              required
              aria-describedby="setup-password-requirements setup-password-feedback"
              aria-invalid={lengthInvalid || undefined}
              className="h-11 bg-card"
            />
            <p id="setup-password-requirements" className="text-muted-foreground text-xs">
              {NEW_PASSWORD_REQUIREMENTS}
            </p>
            <p
              id="setup-password-feedback"
              role="status"
              className={cn("text-xs", lengthInvalid ? "text-destructive" : "text-muted-foreground")}
            >
              {lengthMessage}
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirm">Confirm password</Label>
            <PasswordInput
              id="confirm"
              passwordLabel="password confirmation"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              autoComplete="new-password"
              required
              aria-describedby="setup-confirm-feedback"
              aria-invalid={confirmationMismatch || undefined}
              className="h-11 bg-card"
            />
            <p
              id="setup-confirm-feedback"
              role="status"
              className={cn("text-xs", confirmationMismatch ? "text-destructive" : "text-muted-foreground")}
            >
              {confirmationMessage}
            </p>
          </div>
          {error && (
            <p role="alert" className="text-destructive text-sm">
              {error}
            </p>
          )}
          <Button type="submit" className="h-11 w-full justify-between px-4" disabled={loading || !canSubmit}>
            {loading ? "Saving..." : "Set password and sign in"}
            <ArrowRight aria-hidden="true" />
          </Button>
        </form>
      )}
    </>
  );
}
