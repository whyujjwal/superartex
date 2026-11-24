const TOKEN_KEY = "superartex_token";
const COOKIE_MAX_AGE = 7 * 24 * 60 * 60; // 7 days (seconds)

function clearTokenCookie(): void {
  document.cookie = `${TOKEN_KEY}=; path=/; max-age=0`;
}

// These claims are for display only. The server verifies the token independently.
function readTokenClaims(token: string | null): Record<string, unknown> | null {
  const parts = token?.split(".");
  if (parts?.length !== 3 || parts.some((part) => !/^[A-Za-z0-9_-]+$/.test(part))) return null;
  try {
    const payload: unknown = JSON.parse(atob(parts[1].replace(/-/g, "+").replace(/_/g, "/")));
    if (payload === null || typeof payload !== "object" || Array.isArray(payload)) return null;
    return payload as Record<string, unknown>;
  } catch {
    return null;
  }
}

export interface CurrentUser {
  id: string;
  name: string;
  username: string;
  email: string;
  avatar: string;
  role: string;
}

export const auth = {
  getToken(): string | null {
    if (typeof window === "undefined") return null;
    // Mock demo: no real login; return a fake token so the route guard allows going straight into the main UI.
    return localStorage.getItem(TOKEN_KEY) ?? (process.env.NEXT_PUBLIC_MOCK === "1" ? "mock-demo" : null);
  },

  setToken(token: string): void {
    localStorage.setItem(TOKEN_KEY, token);
    // Also write a cookie for the Next.js middleware to read server-side
    document.cookie = `${TOKEN_KEY}=${encodeURIComponent(token)}; path=/; max-age=${COOKIE_MAX_AGE}; SameSite=Lax`;
  },

  clearToken(): void {
    localStorage.removeItem(TOKEN_KEY);
    clearTokenCookie();
  },

  onCrossTabSignOut(onSignOut: () => void): () => void {
    function unsubscribe() {
      window.removeEventListener("storage", handleStorage);
    }

    function handleStorage(event: StorageEvent) {
      if (event.storageArea !== window.localStorage || (event.key !== null && event.key !== TOKEN_KEY)) return;
      // A more recent login may have replaced the token before this event was delivered.
      if (auth.getToken()) return;

      unsubscribe();
      clearTokenCookie();
      onSignOut();
    }

    window.addEventListener("storage", handleStorage);
    return unsubscribe;
  },

  getSessionExpiry(): Date | null {
    const exp = readTokenClaims(this.getToken())?.exp;
    if (typeof exp !== "number") return null;
    const expiry = new Date(exp * 1000);
    return Number.isFinite(expiry.getTime()) ? expiry : null;
  },

  getCurrentUser(): CurrentUser | null {
    const claims = readTokenClaims(this.getToken());
    if (!claims) return null;
    const username = typeof claims.sub === "string" ? claims.sub : "SUPERARTEX";
    return { id: "1", name: username, username, email: "", avatar: "", role: "operator" };
  },
};
