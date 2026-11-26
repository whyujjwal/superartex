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

type StatusCheck = "checking" | "retrying" | "unavailable" | "ready";

export default function SetupPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [setupToken, setSetupToken] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<StatusCheck>("checking");
  const retrying = status === "retrying";
  const { isValid, lengthInvalid, confirmationMismatch, lengthMessage, confirmationMessage } = getNewPasswordFeedback(
    password,
    confirm,
  );
  const trimmedSetupToken = setupToken.trim();
  const canSubmit = Boolean(trimmedSetupToken) && isValid;

  useEffect(() => {
    if (status !== "checking" && status !== "retrying") return;

    let active = true;
    api
      .authStatus()
      .then(({ initialized }) => {
        if (!active) return;
        if (initialized) {
          router.replace("/login");
          return;
        }
        setStatus("ready");
      })
      .catch(() => {
        if (active) setStatus("unavailable");
      });
    return () => {
      active = false;
    };
  }, [router, status]);

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

  if (status === "checking") {
    return (
      <p role="status" className="text-muted-foreground text-sm">
        Checking setup state…
      </p>
    );
  }

  const unavailable = status !== "ready";
  return (
    <>
      <header className={styles.intro}>
        <h1 className={styles.title}>{unavailable ? "Setup status unavailable" : "Set initial password"}</h1>
        {!unavailable && (
          <p className="text-muted-foreground text-sm leading-relaxed">Use the setup token from the server log.</p>
        )}
      </header>
      {unavailable ? (
        <div className="flex flex-col gap-5">
          {retrying ? (
            <p role="status" className="text-muted-foreground text-sm">
              Checking setup state…
            </p>
          ) : (
            <p role="alert" className="text-muted-foreground text-sm">
              Unable to check initialization status. Retry to confirm whether setup is available.
            </p>
          )}
          <Button
            type="button"
            className="h-11 w-full aria-disabled:opacity-50"
            aria-disabled={retrying}
            onClick={() => {
              if (status === "unavailable") setStatus("retrying");
            }}
          >
            Retry status check
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
