"use client";

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
import { SEARCH_PAGES_KEY, TOGGLE_SIDEBAR_KEY } from "@/lib/workspace-shortcuts";

const shortcuts = [
  { label: "Search pages", key: SEARCH_PAGES_KEY },
  { label: "Toggle sidebar", key: TOGGLE_SIDEBAR_KEY },
];

export function KeyboardShortcutsDialog() {
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
          <DialogDescription>Use Ctrl on Windows and Linux or Command on macOS.</DialogDescription>
        </DialogHeader>
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
      </DialogContent>
    </Dialog>
  );
}
