"use client";

import * as React from "react";

import { CheckIcon, CopyIcon, DownloadIcon, FileTextIcon } from "lucide-react";
import { toast } from "sonner";

import { Markdown } from "@/components/markdown";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { api } from "@/lib/api";
import { copyText } from "@/lib/utils";

type ReportState = { status: "loading" | "error" } | { status: "ready"; text: string };

export function ReportTab({ taskId }: { taskId: string }) {
  return <TaskReport key={taskId} taskId={taskId} />;
}

function TaskReport({ taskId }: { taskId: string }) {
  const [state, setState] = React.useState<ReportState>({ status: "loading" });
  const [copied, setCopied] = React.useState(false);
  const mounted = React.useRef(false);
  const copyTimeout = React.useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const loading = state.status === "loading";
  const report = state.status === "ready" ? state.text : "";

  React.useEffect(() => {
    if (!loading) return;
    let active = true;
    api.report(taskId).then(
      (text) => {
        if (active) setState({ status: "ready", text });
      },
      () => {
        if (active) setState({ status: "error" });
      },
    );
    return () => {
      active = false;
    };
  }, [taskId, loading]);

  React.useLayoutEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      clearTimeout(copyTimeout.current);
    };
  }, []);

  async function copy() {
    if (!report || !mounted.current) return;
    const ok = await copyText(report);
    if (!mounted.current) return;
    if (ok) {
      setCopied(true);
      toast.success("Markdown copied");
      clearTimeout(copyTimeout.current);
      copyTimeout.current = setTimeout(() => setCopied(false), 1500);
    } else {
      toast.error("Copy failed; please select the text and copy it manually");
    }
  }

  function download() {
    if (!report || !mounted.current) return;

    const safeTaskId = taskId.replace(/[^a-zA-Z0-9_-]+/g, "-").slice(0, 80) || "unknown";
    const url = URL.createObjectURL(new Blob([report], { type: "text/markdown;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `task-${safeTaskId}-report.md`;
    try {
      document.body.appendChild(link);
      link.click();
    } finally {
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
  }

  return (
    <Card>
      <CardHeader className="items-center gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
        <CardTitle className="flex items-center gap-2 text-sm">
          <FileTextIcon aria-hidden="true" className="size-4 shrink-0" /> Penetration test report (Markdown)
        </CardTitle>
        {report && (
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" variant="outline" onClick={copy}>
              {copied ? <CheckIcon aria-hidden="true" /> : <CopyIcon aria-hidden="true" />} Copy
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={download}>
              <DownloadIcon aria-hidden="true" /> Download
            </Button>
          </div>
        )}
      </CardHeader>
      <CardContent>
        {report ? (
          <div className="max-h-[60vh] overflow-auto rounded-md border bg-muted/20 p-4">
            <Markdown text={report} />
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center gap-2 rounded-md border border-dashed py-16 text-muted-foreground text-sm">
            <FileTextIcon aria-hidden="true" className="size-8 opacity-40" />
            {loading && <p role="status">Loading…</p>}
            {state.status === "error" && (
              <>
                <p role="alert" className="text-destructive">
                  Unable to load the report
                </p>
                <Button type="button" size="sm" variant="outline" onClick={() => setState({ status: "loading" })}>
                  Try again
                </Button>
              </>
            )}
            {state.status === "ready" && <p>No report yet</p>}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
