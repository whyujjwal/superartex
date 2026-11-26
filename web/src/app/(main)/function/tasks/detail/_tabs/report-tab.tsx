"use client";

import * as React from "react";

import { CheckIcon, CopyIcon, DownloadIcon, FileTextIcon, LinkIcon, PrinterIcon, RefreshCwIcon } from "lucide-react";
import { createPortal } from "react-dom";
import { toast } from "sonner";

import { Markdown } from "@/components/markdown";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { api } from "@/lib/api";
import { copyText } from "@/lib/utils";

import { ReportFind } from "./report-find";

type ReportState = { status: "loading" | "error"; text?: string } | { status: "ready"; text: string };
type ReportSection = { id: string; heading: HTMLHeadingElement; label: string };

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
  const safeTaskId = taskId.replace(/[^a-zA-Z0-9_-]+/g, "-").slice(0, 80) || "unknown";
  const reportFileStem = `task-${safeTaskId}-report`;
  const print = useReportPrint(report ? reportFileStem : null);

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

  async function copyReportLink() {
    if (!taskId || !mounted.current) return;

    const link = new URL(window.location.origin);
    link.pathname = window.location.pathname;
    link.searchParams.set("id", taskId);
    link.searchParams.set("tab", "report");

    const ok = await copyText(link.href);
    if (!mounted.current) return;
    if (ok) {
      toast.success("Report link copied");
    } else {
      toast.error("Could not copy the report link");
    }
  }

  function download() {
    if (!report || !mounted.current) return;

    const url = URL.createObjectURL(new Blob([report], { type: "text/markdown;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `${reportFileStem}.md`;
    try {
      document.body.appendChild(link);
      link.click();
    } finally {
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
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
          <Button type="button" size="sm" variant="outline" onClick={copyReportLink} disabled={!taskId}>
            <LinkIcon aria-hidden="true" /> Copy report link
          </Button>
          {hasLoaded && (
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
          )}
        </div>
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
          <ReportPreview report={report} titleId={titleId} />
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

function useReportPrint(title: string | null) {
  const openPrint = React.useRef<(() => void) | null>(null);

  React.useLayoutEffect(() => {
    if (title === null) return;
    const printTitle = title;
    let originalTitle: string | undefined;
    let previewStarted = false;

    function prepareTitle() {
      if (originalTitle !== undefined) return;
      originalTitle = document.title;
      document.title = printTitle;
    }

    function beforePrint() {
      previewStarted = true;
      prepareTitle();
    }

    function restoreTitle() {
      if (originalTitle === undefined) return;
      if (document.title === printTitle) document.title = originalTitle;
      originalTitle = undefined;
    }

    openPrint.current = () => {
      if (originalTitle !== undefined) return;
      previewStarted = false;
      prepareTitle();
      try {
        window.print();
      } catch {
        restoreTitle();
        toast.error("Could not open the print dialog");
        return;
      }
      // A started print preview can outlast print(). Its afterprint event restores the title.
      if (!previewStarted) restoreTitle();
    };

    window.addEventListener("beforeprint", beforePrint);
    window.addEventListener("afterprint", restoreTitle);
    return () => {
      openPrint.current = null;
      window.removeEventListener("beforeprint", beforePrint);
      window.removeEventListener("afterprint", restoreTitle);
      restoreTitle();
    };
  }, [title]);

  return () => openPrint.current?.();
}

function ReportPreview({ report, titleId }: { report: string; titleId: string }) {
  const preview = React.useRef<HTMLElement>(null);
  const selectId = React.useId();
  const previewId = React.useId();
  const [expanded, setExpanded] = React.useState(false);
  const [sections, setSections] = React.useState<ReportSection[]>([]);
  const [selectedSection, setSelectedSection] = React.useState("");

  // biome-ignore lint/correctness/useExhaustiveDependencies: The rendered headings need to be read again when the report changes.
  React.useLayoutEffect(() => {
    const container = preview.current;
    if (!container) return;
    const headings = container.querySelectorAll<HTMLHeadingElement>("h1, h2, h3, h4, h5, h6");
    const visibleHeadings: Omit<ReportSection, "id">[] = [];
    const counts = new Map<string, number>();
    for (const heading of headings) {
      const label = heading.textContent.trim().replace(/\s+/g, " ");
      if (!label || heading.closest('[hidden], [aria-hidden="true"], .sr-only')) continue;
      visibleHeadings.push({ heading, label });
      counts.set(label, (counts.get(label) ?? 0) + 1);
    }

    const occurrences = new Map<string, number>();
    const nextSections = visibleHeadings.map(({ heading, label }) => {
      const count = counts.get(label) ?? 0;
      const occurrence = (occurrences.get(label) ?? 0) + 1;
      occurrences.set(label, occurrence);
      return {
        id: `${occurrence}:${label}`,
        heading,
        label: count > 1 ? `${label} (${occurrence} of ${count})` : label,
      };
    });
    setSections(nextSections);
    setSelectedSection("");
    return observeReportTables(container);
  }, [report]);

  function jumpToSection() {
    if (!selectedSection) return;
    const container = preview.current;
    const heading = sections[Number(selectedSection)]?.heading;
    if (!container || !heading || !container.contains(heading)) return;

    container.scrollTop +=
      heading.getBoundingClientRect().top - container.getBoundingClientRect().top - container.clientTop;
    heading.tabIndex = -1;
    heading.focus({ preventScroll: true });
  }

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {sections.length > 1 && (
          <div className="flex flex-wrap items-center gap-2">
            <label htmlFor={selectId} className="font-medium text-sm">
              Jump to section
            </label>
            <NativeSelect
              id={selectId}
              size="sm"
              className="w-56 min-w-0 max-w-full"
              value={selectedSection}
              onChange={(event) => setSelectedSection(event.currentTarget.value)}
            >
              <NativeSelectOption value="" disabled>
                Select a section
              </NativeSelectOption>
              {sections.map(({ id, label }, index) => (
                <NativeSelectOption key={id} value={String(index)}>
                  {label}
                </NativeSelectOption>
              ))}
            </NativeSelect>
            <Button type="button" size="sm" variant="outline" disabled={!selectedSection} onClick={jumpToSection}>
              Go
            </Button>
          </div>
        )}
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="ms-auto"
          aria-controls={previewId}
          onClick={() => setExpanded((value) => !value)}
        >
          {expanded ? "Compact preview" : "Expand preview"}
        </Button>
      </div>
      <ReportFind preview={preview} previewId={previewId} report={report} />
      <section
        id={previewId}
        ref={preview}
        aria-labelledby={titleId}
        // biome-ignore lint/a11y/noNoninteractiveTabindex: The independently scrollable preview needs keyboard focus for scrolling.
        tabIndex={0}
        className={`${expanded ? "max-h-[85dvh]" : "max-h-[60vh]"} overflow-auto rounded-md border bg-muted/20 p-4 focus-visible:outline-2 focus-visible:outline-ring [&::highlight(superartex-report-match)]:bg-amber-200 [&::highlight(superartex-report-match)]:text-black [&_[data-report-match]]:outline-2 [&_[data-report-match]]:outline-ring`}
      >
        <Markdown text={report} allowImages={false} firstHeadingLevel={3} reportTableRegions />
      </section>
    </>
  );
}

function observeReportTables(preview: HTMLElement) {
  const regions = preview.querySelectorAll<HTMLElement>("[data-report-table-scroll]");
  if (!regions.length) return;

  function updateRegions() {
    regions.forEach((region, index) => {
      if (region.scrollWidth > region.clientWidth) {
        region.tabIndex = 0;
        region.setAttribute("aria-label", `Scrollable report table ${index + 1}`);
      } else {
        region.removeAttribute("tabindex");
        region.removeAttribute("aria-label");
      }
    });
  }

  updateRegions();
  const observer = new ResizeObserver(updateRegions);
  for (const region of regions) {
    observer.observe(region);
    if (region.firstElementChild) observer.observe(region.firstElementChild);
  }
  return () => observer.disconnect();
}
