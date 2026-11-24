"use client";

import { type ReactNode, useEffect, useState } from "react";

import { usePathname } from "next/navigation";

import { X } from "lucide-react";

import { SidebarTrigger } from "@/components/ui/sidebar";
import { useCurrentUser } from "@/hooks/use-current-user";
import { api } from "@/lib/api";
import { getLocalStorageValue, setLocalStorageValue } from "@/lib/local-storage.client";
import { cn } from "@/lib/utils";

import { AccountSwitcher } from "./sidebar/account-switcher";
import { KeyboardShortcutsDialog } from "./sidebar/keyboard-shortcuts-dialog";
import { LayoutControls } from "./sidebar/layout-controls";
import { SearchDialog } from "./sidebar/search-dialog";
import { ThemeSwitcher } from "./sidebar/theme-switcher";

// Task detail pages stay as-is: they bring their own header/Tabs and padding, so no extra global header or padding is stacked here.
function isFullBleed(pathname: string) {
  const p = (() => {
    try {
      return decodeURIComponent(pathname);
    } catch {
      return pathname;
    }
  })();
  // Static export enables trailingSlash, so the list page's own pathname is "/function/tasks/",
  // strip the trailing slash before the prefix test, or the list page would be mistaken for a detail page and lose the global header.
  const normalized = p.replace(/\/+$/, "");
  return normalized.startsWith("/function/tasks/");
}

const RELEASES_URL =
  (typeof process !== "undefined" && process.env.NEXT_PUBLIC_RELEASES_URL?.trim()) || "";
const UPDATE_DISMISSED_KEY = "superartex-update-dismissed";

export function MainContent({ children }: { children: ReactNode }) {
  const currentUser = useCurrentUser();
  const pathname = usePathname();
  const [version, setVersion] = useState("");
  // Only set when the backend has the opt-in update check on (SUPERARTEX_UPDATE_CHECK) and found a newer release.
  const [latest, setLatest] = useState("");

  useEffect(() => {
    api
      .health()
      .then((h) => {
        setVersion((h.version ?? "").replace(/^v(?=\d)/, ""));
        const l = h.latest_version ?? "";
        setLatest(l && getLocalStorageValue(UPDATE_DISMISSED_KEY) !== l ? l : "");
      })
      .catch(() => setVersion(""));
  }, []);

  const updateBanner = latest ? (
    <div className="flex shrink-0 items-center justify-center gap-2 border-b bg-muted/50 px-4 py-1 text-xs">
      {RELEASES_URL ? (
        <a href={RELEASES_URL} target="_blank" rel="noreferrer" className="underline-offset-2 hover:underline">
          Version {latest} is available. See the release notes.
        </a>
      ) : (
        <span>Version {latest} is available.</span>
      )}
      <button
        type="button"
        aria-label="Dismiss update notice"
        className="text-muted-foreground hover:text-foreground"
        onClick={() => {
          setLocalStorageValue(UPDATE_DISMISSED_KEY, latest);
          setLatest("");
        }}
      >
        <X className="size-3.5" />
      </button>
    </div>
  ) : null;

  if (isFullBleed(pathname)) {
    return (
      <>
        {updateBanner}
        {children}
      </>
    );
  }

  return (
    <>
      {updateBanner}
      <header
        className={cn(
          "flex h-14 shrink-0 items-center border-b bg-card",
          "[html[data-navbar-style=sticky]_&]:sticky [html[data-navbar-style=sticky]_&]:top-0 [html[data-navbar-style=sticky]_&]:z-40 [html[data-navbar-style=sticky]_&]:rounded-t-[inherit]",
        )}
      >
        <div className="flex w-full items-center justify-between gap-2 px-4 md:px-6 lg:px-8">
          <div className="flex min-w-0 items-center gap-2 sm:gap-3">
            <SidebarTrigger className="-ml-1 shrink-0 text-muted-foreground" />
            <SearchDialog />
            <KeyboardShortcutsDialog />
          </div>
          <div className="flex items-center gap-2">
            {version && (
              <span className="mr-2 hidden font-mono text-xs text-muted-foreground sm:inline">
                <span className="sr-only">Version </span>v{version}
              </span>
            )}
            <LayoutControls />
            <ThemeSwitcher />
            <AccountSwitcher users={[currentUser]} />
          </div>
        </div>
      </header>
      <div className="min-h-0 min-w-0 flex-1 overflow-x-hidden p-4 has-data-[content-padding=false]:p-0 md:p-6 md:has-data-[content-padding=false]:p-0 lg:px-8">
        {children}
      </div>
    </>
  );
}
