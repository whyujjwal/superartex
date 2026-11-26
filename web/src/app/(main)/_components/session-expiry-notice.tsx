import { useEffect } from "react";

import { toast } from "sonner";

import { auth } from "@/lib/auth";

const WARNING_WINDOW_MS = 5 * 60 * 1000;
const MAX_TIMEOUT_MS = 2_147_483_647;

export function SessionExpiryNotice() {
  useEffect(() => {
    let token: string | null = null;
    let warned = false;
    let warningId: ReturnType<typeof toast.warning> | undefined;
    let timer: number | undefined;

    function clearWarning() {
      if (warningId !== undefined) toast.dismiss(warningId);
      warningId = undefined;
    }

    function checkExpiry() {
      window.clearTimeout(timer);
      const currentToken = auth.getToken();
      if (token !== currentToken) {
        clearWarning();
        token = currentToken;
        warned = false;
      }

      const expiry = auth.getSessionExpiry();
      const remaining = expiry ? expiry.getTime() - Date.now() : 0;
      if (remaining <= 0) {
        clearWarning();
        return;
      }
      if (document.visibilityState === "hidden") return;

      if (!warned && remaining <= WARNING_WINDOW_MS) {
        warned = true;
        warningId = toast.warning("Your sign-in will expire soon", {
          description: "Finish any unsaved changes before signing in again.",
          duration: Infinity,
          closeButton: true,
        });
      }

      const delay = warned ? remaining : remaining - WARNING_WINDOW_MS;
      timer = window.setTimeout(checkExpiry, Math.min(delay, MAX_TIMEOUT_MS));
    }

    const unsubscribe = auth.onCrossTabSessionChange(checkExpiry);
    document.addEventListener("visibilitychange", checkExpiry);
    window.addEventListener("pageshow", checkExpiry);
    checkExpiry();
    return () => {
      unsubscribe();
      document.removeEventListener("visibilitychange", checkExpiry);
      window.removeEventListener("pageshow", checkExpiry);
      window.clearTimeout(timer);
      clearWarning();
    };
  }, []);

  return null;
}
