"use client";

import { useId } from "react";

import { Keyboard } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Kbd } from "@/components/ui/kbd";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { setLocalStorageValue } from "@/lib/local-storage.client";
import { SEARCH_PAGES_KEY, TOGGLE_SIDEBAR_KEY, WORKSPACE_SHORTCUTS_STORAGE_KEY } from "@/lib/workspace-shortcuts";
import { usePreferencesStore } from "@/stores/preferences/preferences-provider";

const shortcuts = [
  { label: "Search pages", key: SEARCH_PAGES_KEY },
  { label: "Toggle sidebar", key: TOGGLE_SIDEBAR_KEY },
];

export function KeyboardShortcutsDialog() {
  const switchId = useId();
  const shortcutsEnabled = usePreferencesStore((state) => state.workspaceShortcutsEnabled);
  const setShortcutsEnabled = usePreferencesStore((state) => state.setWorkspaceShortcutsEnabled);

  function changeShortcutsEnabled(enabled: boolean) {
    setShortcutsEnabled(enabled);
    setLocalStorageValue(WORKSPACE_SHORTCUTS_STORAGE_KEY, enabled ? "on" : "off");
  }

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          aria-label="Keyboard shortcuts"
          title="Keyboard shortcuts"
          className="shrink-0 text-muted-foreground"
        >
          <Keyboard aria-hidden="true" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Keyboard shortcuts</DialogTitle>
          <DialogDescription>
            {shortcutsEnabled
              ? "Use Ctrl on Windows and Linux or Command on macOS."
              : "Workspace shortcuts are off in this browser."}
          </DialogDescription>
        </DialogHeader>
        <div className="flex items-center justify-between gap-4 rounded-md border p-3">
          <Label htmlFor={switchId}>Enable workspace shortcuts</Label>
          <Switch id={switchId} checked={shortcutsEnabled} onCheckedChange={changeShortcutsEnabled} />
        </div>
        {shortcutsEnabled && (
          <dl className="divide-y divide-border">
            {shortcuts.map(({ label, key }) => (
              <div key={key} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-2">
                <dt className="font-medium">{label}</dt>
                <dd className="flex items-center gap-1.5">
                  <Kbd>Ctrl + {key.toUpperCase()}</Kbd>
                  <span className="text-muted-foreground text-xs">or</span>
                  <Kbd>Command + {key.toUpperCase()}</Kbd>
                </dd>
              </div>
            ))}
          </dl>
        )}
      </DialogContent>
    </Dialog>
  );
}
