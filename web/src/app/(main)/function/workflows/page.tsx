"use client";

import * as React from "react";

import { Loader2Icon, PlayIcon, RefreshCwIcon, Trash2Icon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { api } from "@/lib/api";
import type { ScanToolSpec, Workflow, WorkflowRun, WorkflowStep } from "@/lib/types";

function statusVariant(status: string): "default" | "secondary" | "destructive" | "outline" {
  if (status === "succeeded") return "default";
  if (status === "failed") return "destructive";
  if (status === "running") return "secondary";
  return "outline";
}

type DraftStep = WorkflowStep & { paramsText: string };

function stepFromDraft(d: DraftStep): WorkflowStep | null {
  let params: Record<string, unknown> = {};
  if (d.paramsText.trim()) {
    try {
      params = JSON.parse(d.paramsText) as Record<string, unknown>;
    } catch {
      return null;
    }
  }
  return { tool: d.tool, params, on_failure: d.on_failure };
}

export default function WorkflowsPage() {
  const [workflows, setWorkflows] = React.useState<Workflow[]>([]);
  const [runs, setRuns] = React.useState<WorkflowRun[]>([]);
  const [tools, setTools] = React.useState<ScanToolSpec[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");

  const [createOpen, setCreateOpen] = React.useState(false);
  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [steps, setSteps] = React.useState<DraftStep[]>([]);

  const [runTarget, setRunTarget] = React.useState<Workflow | null>(null);
  const [runTaskID, setRunTaskID] = React.useState("");
  const [expandedRun, setExpandedRun] = React.useState<number | null>(null);

  const load = React.useCallback(async () => {
    try {
      const [ws, rs, ts] = await Promise.all([api.workflows(), api.workflowRuns({ limit: 25 }), api.scanTools()]);
      setWorkflows(ws);
      setRuns(rs);
      setTools(ts);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void load();
    const poll = window.setInterval(() => void api.workflowRuns({ limit: 25 }).then(setRuns).catch(() => {}), 8000);
    return () => window.clearInterval(poll);
  }, [load]);

  function addStep() {
    const first = tools[0];
    if (!first) return;
    setSteps((cur) => [...cur, { tool: first.key, params: {}, paramsText: "", on_failure: "stop" }]);
  }

  async function create() {
    const built: WorkflowStep[] = [];
    for (const s of steps) {
      const step = stepFromDraft(s);
      if (!step) {
        setError(`Step ${built.length + 1}: params are not valid JSON`);
        return;
      }
      built.push(step);
    }
    try {
      await api.createWorkflow({ name, description, steps: built });
      setCreateOpen(false);
      setName("");
      setDescription("");
      setSteps([]);
      setError("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "create failed");
    }
  }

  async function run() {
    if (!runTarget) return;
    try {
      await api.runWorkflow(runTarget.id, runTaskID.trim());
      setRunTarget(null);
      setRunTaskID("");
      setError("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "run failed");
    }
  }

  async function remove(id: number) {
    await api.deleteWorkflow(id);
    await load();
  }

  const specOf = (key: string) => tools.find((t) => t.key === key);

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold">Workflows</h1>
          <p className="text-sm text-muted-foreground">
            Ordered scan-tool steps run against one task. Every step executes through the allowlisted runner and shows up on
            Processes. Starting a run is the operator decision: verify the task scope first.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => void load()}>
            <RefreshCwIcon className="mr-1 size-3.5" />
            Refresh
          </Button>
          <Button size="sm" disabled={tools.length === 0} onClick={() => setCreateOpen(true)}>
            New workflow
          </Button>
        </div>
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Steps</TableHead>
              <TableHead>Updated</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={4} className="text-muted-foreground">
                  <Loader2Icon className="mr-2 inline size-4 animate-spin" />
                  Loading
                </TableCell>
              </TableRow>
            ) : workflows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="text-muted-foreground">
                  No workflows yet. Create one from the typed scan tools.
                </TableCell>
              </TableRow>
            ) : (
              workflows.map((wf) => (
                <TableRow key={wf.id}>
                  <TableCell>
                    <div className="font-medium">{wf.name}</div>
                    <div className="text-xs text-muted-foreground">{wf.description}</div>
                  </TableCell>
                  <TableCell className="max-w-2xl truncate text-xs text-muted-foreground">
                    {wf.steps.map((s) => s.tool).join(" → ")}
                  </TableCell>
                  <TableCell className="text-xs">{new Date(wf.updated_at).toLocaleString("en-US")}</TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-2">
                      <Button size="sm" variant="outline" onClick={() => setRunTarget(wf)}>
                        <PlayIcon className="mr-1 size-3" />
                        Run
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => void remove(wf.id)}>
                        <Trash2Icon className="size-3" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>

      <h2 className="text-sm font-semibold">Recent runs</h2>
      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Run</TableHead>
              <TableHead>Task</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Steps</TableHead>
              <TableHead>Started</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {runs.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-muted-foreground">
                  No runs yet.
                </TableCell>
              </TableRow>
            ) : (
              runs.map((r) => (
                <TableRow key={r.id} className="cursor-pointer" onClick={() => setExpandedRun(expandedRun === r.id ? null : r.id)}>
                  <TableCell className="font-mono text-xs">#{r.id}</TableCell>
                  <TableCell className="font-mono text-xs">{r.task_id}</TableCell>
                  <TableCell>
                    <Badge variant={statusVariant(r.status)}>{r.status}</Badge>
                  </TableCell>
                  <TableCell className="text-xs">
                    {r.step_results.map((s) => `${s.tool}:${s.status}`).join(", ") || "—"}
                  </TableCell>
                  <TableCell className="text-xs">{new Date(r.created_at).toLocaleString("en-US")}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>New workflow</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Input placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} />
            <Input placeholder="Description (optional)" value={description} onChange={(e) => setDescription(e.target.value)} />
            <div className="space-y-3">
              {steps.map((s, i) => (
                <div key={i} className="space-y-2 rounded-md border p-3">
                  <div className="flex items-center gap-2">
                    <span className="w-5 text-xs text-muted-foreground">{i + 1}.</span>
                    <Select
                      value={s.tool}
                      onValueChange={(v) => setSteps((cur) => cur.map((x, j) => (j === i ? { ...x, tool: v } : x)))}
                    >
                      <SelectTrigger className="w-56">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {tools.map((t) => (
                          <SelectItem key={t.key} value={t.key}>
                            {t.key}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select
                      value={s.on_failure ?? "stop"}
                      onValueChange={(v) =>
                        setSteps((cur) => cur.map((x, j) => (j === i ? { ...x, on_failure: v as "stop" | "continue" } : x)))
                      }
                    >
                      <SelectTrigger className="w-44">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="stop">Stop on failure</SelectItem>
                        <SelectItem value="continue">Continue on failure</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button
                      size="sm"
                      variant="outline"
                      className="ml-auto"
                      onClick={() => setSteps((cur) => cur.filter((_, j) => j !== i))}
                    >
                      Remove
                    </Button>
                  </div>
                  <Input
                    placeholder='Params JSON, e.g. {"target": "app.example.com"}'
                    value={s.paramsText}
                    onChange={(e) => setSteps((cur) => cur.map((x, j) => (j === i ? { ...x, paramsText: e.target.value } : x)))}
                    className="font-mono text-xs"
                  />
                  {(() => {
                    const spec = specOf(s.tool);
                    if (!spec) return null;
                    return (
                      <p className="text-xs text-muted-foreground">
                        required: {spec.required.filter((k) => k !== "task_id").join(", ") || "none"} — {spec.description}
                      </p>
                    );
                  })()}
                </div>
              ))}
              <Button size="sm" variant="outline" onClick={addStep}>
                Add step
              </Button>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => void create()} disabled={!name.trim() || steps.length === 0}>
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={runTarget !== null} onOpenChange={(o) => !o && setRunTarget(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Run “{runTarget?.name}”</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {runTarget?.steps.length} step(s) will run through the allowlisted scan runner against this task. Confirm the task
            scope before starting.
          </p>
          <Input placeholder="Task id (e.g. 12)" value={runTaskID} onChange={(e) => setRunTaskID(e.target.value)} />
          <DialogFooter>
            <Button onClick={() => void run()} disabled={!runTaskID.trim()}>
              Start run
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}