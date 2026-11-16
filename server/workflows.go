package server

import (
	"encoding/json"
	"log"
	"net/http"
	"strconv"

	"github.com/whyujjwal/superartex/db"
)

// Operator-defined workflows: an ordered list of typed scan wrapper steps run
// against one chosen task. Execution goes only through the allowlisted scan
// runner, so every step is cached, capped, circuit-broken, and recorded as a
// scan job visible on the Processes page. Starting a run is itself the human
// decision: the operator picked the workflow, the task, and can cancel any
// step's job live.

func (s *Server) pgListWorkflows(w http.ResponseWriter, _ *http.Request) {
	ws, err := s.m.PG().ListWorkflows()
	if err != nil {
		writeErr(w, 500, err.Error())
		return
	}
	if ws == nil {
		ws = []db.Workflow{}
	}
	writeJSON(w, 200, map[string]any{"workflows": ws})
}

func (s *Server) pgCreateWorkflow(w http.ResponseWriter, r *http.Request) {
	r.Body = http.MaxBytesReader(w, r.Body, 512<<10)
	var body struct {
		Name        string            `json:"name"`
		Description string            `json:"description"`
		Steps       []db.WorkflowStep `json:"steps"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeErr(w, 400, "invalid body: "+err.Error())
		return
	}
	// Every step must reference a known typed wrapper before anything is stored.
	for _, step := range body.Steps {
		if _, ok := scanSpecByKey(step.Tool); !ok {
			writeErr(w, 400, "unknown scan tool: "+step.Tool)
			return
		}
	}
	wf, err := s.m.PG().CreateWorkflow(body.Name, body.Description, body.Steps)
	if err != nil {
		writeErr(w, 400, err.Error())
		return
	}
	writeJSON(w, 200, wf)
}

func (s *Server) pgDeleteWorkflow(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil {
		writeErr(w, 400, "invalid id")
		return
	}
	deleted, err := s.m.PG().DeleteWorkflow(id)
	if err != nil {
		writeErr(w, 500, err.Error())
		return
	}
	if !deleted {
		writeErr(w, 404, "workflow not found")
		return
	}
	writeJSON(w, 200, map[string]any{"deleted": id})
}

// pgRunWorkflow starts a workflow against one task. The run executes in the
// background; the response returns the run id immediately.
func (s *Server) pgRunWorkflow(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil {
		writeErr(w, 400, "invalid id")
		return
	}
	var body struct {
		TaskID string `json:"task_id"`
	}
	_ = json.NewDecoder(http.MaxBytesReader(w, r.Body, 4096)).Decode(&body)
	if body.TaskID == "" {
		writeErr(w, 400, "task_id is required")
		return
	}
	if _, ok := s.m.Task(body.TaskID); !ok {
		writeErr(w, 404, "task not found: "+body.TaskID)
		return
	}
	wf, err := s.m.PG().GetWorkflow(id)
	if err != nil {
		writeErr(w, 500, err.Error())
		return
	}
	if wf == nil {
		writeErr(w, 404, "workflow not found")
		return
	}
	runID, err := s.m.PG().InsertWorkflowRun(wf.ID, body.TaskID)
	if err != nil {
		writeErr(w, 500, err.Error())
		return
	}
	go s.executeWorkflowRun(runID, *wf, body.TaskID)
	log.Printf("[workflow] run %d started: workflow=%d task=%s steps=%d", runID, wf.ID, body.TaskID, len(wf.Steps))
	writeJSON(w, 200, map[string]any{"run_id": runID, "status": "running"})
}

func (s *Server) pgListWorkflowRuns(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	var workflowID int64
	if v := q.Get("workflow"); v != "" {
		workflowID, _ = strconv.ParseInt(v, 10, 64)
	}
	limit, _ := strconv.Atoi(q.Get("limit"))
	runs, err := s.m.PG().ListWorkflowRuns(workflowID, limit)
	if err != nil {
		writeErr(w, 500, err.Error())
		return
	}
	if runs == nil {
		runs = []db.WorkflowRun{}
	}
	writeJSON(w, 200, map[string]any{"runs": runs})
}

// pgListScanTools returns the typed wrapper catalog so the workflow editor can
// offer only tools that actually execute.
func (s *Server) pgListScanTools(w http.ResponseWriter, _ *http.Request) {
	type specDTO struct {
		Key      string         `json:"key"`
		Bin      string         `json:"bin"`
		Desc     string         `json:"description"`
		Props    map[string]any `json:"params"`
		Required []string       `json:"required"`
	}
	out := make([]specDTO, 0, len(typedScanSpecs))
	for _, spec := range typedScanSpecs {
		out = append(out, specDTO{Key: spec.key, Bin: spec.bin, Desc: spec.desc, Props: spec.props, Required: spec.required})
	}
	writeJSON(w, 200, map[string]any{"tools": out})
}

// executeWorkflowRun runs each step through the scan runner in order.
func (s *Server) executeWorkflowRun(runID int64, wf db.Workflow, taskRef string) {
	jobs := s.scanJobs()
	status := "succeeded"
	results := make([]db.StepResult, 0, len(wf.Steps))
	for i, step := range wf.Steps {
		res := db.StepResult{Index: i, Tool: step.Tool}
		spec, ok := scanSpecByKey(step.Tool)
		if !ok {
			res.Status = "failed"
			res.Error = "unknown scan tool"
			results = append(results, res)
			status = "failed"
			if step.OnFailure != "continue" {
				break
			}
			continue
		}
		params := step.Params
		if params == nil {
			params = map[string]any{}
		}
		missing := ""
		for _, req := range spec.required {
			if req == "task_id" {
				continue
			}
			if strField(params, req) == "" {
				missing = req
				break
			}
		}
		if missing != "" {
			res.Status = "failed"
			res.Error = "missing required param: " + missing
			results = append(results, res)
			status = "failed"
			if step.OnFailure != "continue" {
				break
			}
			continue
		}
		job, err := jobs.Start(s.ctx, taskRef, spec.bin, spec.args(params))
		if err != nil {
			res.Status = "failed"
			res.Error = err.Error()
			results = append(results, res)
			status = "failed"
			if step.OnFailure != "continue" {
				break
			}
			continue
		}
		res.JobID = job.ID
		res.CachedFrom = job.CachedFrom
		if job.Status == "succeeded" || job.Status == "failed" || job.Status == "cancelled" {
			// Cache hit or instant finish: no waiting needed.
			res.Status = job.Status
		} else {
			done, _ := jobs.Wait(s.ctx, job.ID, 0)
			if done == nil {
				res.Status = "failed"
				res.Error = "job disappeared"
			} else {
				res.Status = done.Status
				if done.Error != "" {
					res.Error = done.Error
				}
			}
		}
		results = append(results, res)
		if res.Status != "succeeded" {
			if res.Status == "cancelled" {
				status = "cancelled"
			} else {
				status = "failed"
			}
			if step.OnFailure != "continue" {
				break
			}
		}
	}
	if err := s.m.PG().FinishWorkflowRun(runID, status, results); err != nil {
		log.Printf("[workflow] run %d finish record failed: %v", runID, err)
	}
	log.Printf("[workflow] run %d finished: %s", runID, status)
}
