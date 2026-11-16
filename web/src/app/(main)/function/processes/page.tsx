"use client";

import * as React from "react";

import { Loader2Icon, RefreshCwIcon, SquareIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { api, sseUrl } from "@/lib/api";
import type { ScanJob } from "@/lib/types";
import { cn } from "@/lib/utils";

const FILTERS = ["all", "queued", "running", "succeeded", "failed", "cancelled"] as const;

function statusVariant(status: string): "default" | "secondary" | "destructive" | "outline" {
  if (status === "succeeded") return "default";
  if (status === "failed") return "destructive";
  if (status === "running" || status === "queued") return "secondary";
  return "outline";
}

function when(value?: string) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString();
}

export default function ProcessesPage() {
  const [jobs, setJobs] = React.useState<ScanJob[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");
  const [live, setLive] = React.useState(false);
  const [filter, setFilter] = React.useState<(typeof FILTERS)[number]>("all");
  const [query, setQuery] = React.useState("");
  const [selected, setSelected] = React.useState<string | null>(null);
  const [cancelling, setCancelling] = React.useState<string | null>(null);

  const apply = React.useCallback((next: ScanJob[]) => {
    setJobs(next);
    setSelected((cur) => (cur && next.some((job) => job.id === cur) ? cur : (next[0]?.id ?? null)));
  }, []);

  const load = React.useCallback(async () => {
    try {
      apply(await api.scanJobs());
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "failed to load jobs");
    } finally {
      setLoading(false);
    }
  }, [apply]);

  React.useEffect(() => {
    void load();
    const es = new EventSource(sseUrl("/api/scan-jobs/stream"));
    es.onopen = () => setLive(true);
    es.onmessage = (ev) => {
      try {
        const body = JSON.parse(ev.data) as { jobs?: ScanJob[] };
        if (Array.isArray(body.jobs)) {
          apply(body.jobs);
          setLoading(false);
          setError("");
          setLive(true);
        }
      } catch {
        /* a partial frame is ignored; the next event replaces it */
      }
    };
    es.onerror = () => setLive(false);
    const poll = window.setInterval(() => {
      if (es.readyState === EventSource.CLOSED) void load();
    }, 15000);
    return () => {
      window.clearInterval(poll);
      es.close();
    };
  }, [apply, load]);

  async function cancel(id: string) {
    setCancelling(id);
    try {
      await api.cancelScanJob(id);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "cancel failed");
    } finally {
      setCancelling(null);
    }
  }

  const needle = query.trim().toLowerCase();
  const visible = jobs.filter((job) => {
    if (filter !== "all" && job.status !== filter) return false;
    if (!needle) return true;
    const hay = `${job.tool} ${job.task_id} ${job.id} ${(job.args ?? []).join(" ")}`.toLowerCase();
    return hay.includes(needle);
  });
  const current = jobs.find((job) => job.id === selected) ?? null;
  const running = jobs.filter((job) => job.status === "queued" || job.status === "running").length;

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold">Processes</h1>
          <p className="text-sm text-muted-foreground">
            Allowlisted scans from start_scan_job. {running} active. {live ? "Live updates on." : "Live stream reconnecting; the list still refreshes."}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void load()}>
          <RefreshCwIcon className="mr-1 size-3.5" />
          Refresh
        </Button>
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <div className="flex flex-wrap items-center gap-2">
        {FILTERS.map((item) => (
          <Button key={item} size="sm" variant={filter === item ? "default" : "outline"} onClick={() => setFilter(item)}>
            {item}
          </Button>
        ))}
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter by tool, task, or argument"
          className="ml-auto w-full max-w-xs"
        />
      </div>
      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Tool</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Task</TableHead>
              <TableHead>Started</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={5} className="text-muted-foreground">
                  <Loader2Icon className="mr-2 inline size-4 animate-spin" />
                  Loading
                </TableCell>
              </TableRow>
            ) : visible.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-muted-foreground">
                  {jobs.length === 0 ? "No background scans yet. An agent starts one with start_scan_job." : "Nothing matches this filter."}
                </TableCell>
              </TableRow>
            ) : (
              visible.map((job) => (
                <TableRow key={job.id} className={cn("cursor-pointer", selected === job.id && "bg-muted/50")} onClick={() => setSelected(job.id)}>
                  <TableCell>
                    {job.tool}
                    {job.cached_from ? (
                      <Badge variant="outline" className="ml-2">
                        cached
                      </Badge>
                    ) : null}
                  </TableCell>
                  <TableCell>
                    <Badge variant={statusVariant(job.status)}>{job.status}</Badge>
                  </TableCell>
                  <TableCell className="max-w-40 truncate font-mono text-xs">{job.task_id || "—"}</TableCell>
                  <TableCell className="text-xs">{when(job.started_at ?? job.created_at)}</TableCell>
                  <TableCell>
                    {job.status === "queued" || job.status === "running" ? (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={cancelling === job.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          void cancel(job.id);
                        }}
                      >
                        <SquareIcon className="mr-1 size-3" />
                        {cancelling === job.id ? "Cancelling" : "Cancel"}
                      </Button>
                    ) : null}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>
      {current ? (
        <Card className="space-y-2 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={statusVariant(current.status)}>{current.status}</Badge>
            <span className="font-mono text-xs text-muted-foreground">{current.id}</span>
            {current.exit_code !== undefined ? <span className="text-xs text-muted-foreground">exit {current.exit_code}</span> : null}
          </div>
          <p className="text-xs text-muted-foreground">
            Started {when(current.started_at)} · Finished {when(current.finished_at)}
            {current.cached_from ? ` · cached from ${current.cached_from}` : ""}
          </p>
          <pre className="max-h-96 overflow-auto whitespace-pre-wrap rounded-md bg-muted/40 p-3 text-xs">
            {[current.tool, ...(current.args ?? [])].join(" ")}
            {"\n\n"}
            {current.error ? `${current.error}\n` : ""}
            {current.output || "(no output yet)"}
          </pre>
        </Card>
      ) : null}
    </div>
  );
}
