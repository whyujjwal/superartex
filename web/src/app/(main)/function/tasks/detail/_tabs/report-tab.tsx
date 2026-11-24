"use client";

import * as React from "react";

import { CheckIcon, CopyIcon, DownloadIcon, FileTextIcon, PrinterIcon, RefreshCwIcon } from "lucide-react";
import { createPortal } from "react-dom";
import { toast } from "sonner";

import { Markdown } from "@/components/markdown";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { api } from "@/lib/api";
import { copyText } from "@/lib/utils";

type ReportState = { status: "loading" | "error"; text?: string } | { status: "ready"; text: string };

export function ReportTab({ taskId }: { taskId: string }) {
  return <TaskReport key={taskId} taskId={taskId} />;
}

function TaskReport({ taskId }: { taskId: string }) {
  const [state, setState] = React.useState<ReportState>({ status: "loading" });
  const [copiedReport, setCopiedReport] = React.useState<string>();
  const mounted = React.useRef(false);
  const copyTimeout = React.useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const titleId = React.useId();
  const loading = state.status === "loading";
  const hasLoaded = state.text !== undefined;
  const report = state.text ?? "";

  React.useEffect(() => {
    if (!loading) return;
    const controller = new AbortController();
    api.report(taskId, controller.signal).then(
      (text) => {
        if (!controller.signal.aborted) setState({ status: "ready", text });
      },
      () => {
        if (!controller.signal.aborted) setState((current) => ({ status: "error", text: current.text }));
      },
    );
    return () => controller.abort();
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
      setCopiedReport(report);
      toast.success("Markdown copied");
      clearTimeout(copyTimeout.current);
      copyTimeout.current = setTimeout(() => setCopiedReport(undefined), 1500);
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

  function print() {
    if (report && mounted.current) window.print();
  }

  function loadReport() {
    setState((current) => (current.status === "loading" ? current : { status: "loading", text: current.text }));
  }

  return (
    <Card>
      <CardHeader className="flex flex-wrap items-center justify-between gap-2">
        <CardTitle className="text-sm">
          <h2 id={titleId} className="flex items-center gap-2">
            <FileTextIcon aria-hidden="true" className="size-4 shrink-0" /> Penetration test report (Markdown)
          </h2>
        </CardTitle>
        {hasLoaded && (
          <div className="flex flex-wrap gap-2">
            {report && (
              <>
                <Button type="button" size="sm" variant="outline" onClick={copy}>
                  {copiedReport === report ? <CheckIcon aria-hidden="true" /> : <CopyIcon aria-hidden="true" />} Copy
                </Button>
                <Button type="button" size="sm" variant="outline" onClick={download}>
                  <DownloadIcon aria-hidden="true" /> Download
                </Button>
                <Button type="button" size="sm" variant="outline" onClick={print}>
                  <PrinterIcon aria-hidden="true" /> Print
                </Button>
              </>
            )}
            <Button
              type="button"
              size="sm"
              variant="outline"
              aria-disabled={loading}
              className="aria-disabled:opacity-50"
              onClick={loadReport}
            >
              <RefreshCwIcon aria-hidden="true" /> Refresh
            </Button>
          </div>
        )}
      </CardHeader>
      <CardContent>
        {hasLoaded && loading && (
          <p role="status" className="mb-2 text-muted-foreground text-sm">
            Refreshing report…
          </p>
        )}
        {hasLoaded && state.status === "error" && (
          <p role="alert" className="mb-2 text-destructive text-sm">
            Unable to refresh the report.{report && " Showing the previous report."}
          </p>
        )}
        {report ? (
          <section
            aria-labelledby={titleId}
            // biome-ignore lint/a11y/noNoninteractiveTabindex: The independently scrollable preview needs keyboard focus for scrolling.
            tabIndex={0}
            className="max-h-[60vh] overflow-auto rounded-md border bg-muted/20 p-4 focus-visible:outline-2 focus-visible:outline-ring"
          >
            <Markdown text={report} allowImages={false} firstHeadingLevel={3} />
          </section>
        ) : (
          <div className="flex flex-col items-center justify-center gap-2 rounded-md border border-dashed py-16 text-muted-foreground text-sm">
            <FileTextIcon aria-hidden="true" className="size-8 opacity-40" />
            {!hasLoaded && loading && <p role="status">Loading…</p>}
            {!hasLoaded && state.status === "error" && (
              <>
                <p role="alert" className="text-destructive">
                  Unable to load the report
                </p>
                <Button type="button" size="sm" variant="outline" onClick={loadReport}>
                  Try again
                </Button>
              </>
            )}
            {hasLoaded && <p>No report yet</p>}
          </div>
        )}
      </CardContent>
      {report &&
        createPortal(
          <article data-print-root="task-report">
            <Markdown text={report} allowImages={false} firstHeadingLevel={1} />
          </article>,
          document.body,
        )}
    </Card>
  );
}
