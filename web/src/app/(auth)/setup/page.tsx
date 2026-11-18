"use client";

import { useEffect, useState } from "react";

import { useRouter } from "next/navigation";

import { ArrowRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/ui/password-input";
import { api } from "@/lib/api";
import { auth } from "@/lib/auth";

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
    if (password !== confirm) {
      setError("The two passwords do not match");
      return;
    }
    if (password.length < 12) {
      setError("Password must be at least 12 characters");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const { token } = await api.initPassword(password, setupToken.trim());
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
            : "Use the setup token from the server log and choose a password of at least 12 characters."}
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
            <Input
              id="setup-token"
              value={setupToken}
              onChange={(e) => setSetupToken(e.target.value)}
              autoFocus
              autoComplete="off"
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
              className="h-11 bg-card"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirm">Confirm password</Label>
            <PasswordInput
              id="confirm"
              passwordLabel="password confirmation"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              autoComplete="new-password"
              className="h-11 bg-card"
            />
          </div>
          {error && (
            <p role="alert" className="text-destructive text-sm">
              {error}
            </p>
          )}
          <Button
            type="submit"
            className="h-11 w-full justify-between px-4"
            disabled={loading || !setupToken.trim() || !password || !confirm}
          >
            {loading ? "Saving..." : "Set password and sign in"}
            <ArrowRight aria-hidden="true" />
          </Button>
        </form>
      )}
    </>
  );
}
