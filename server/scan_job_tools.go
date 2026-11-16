package server

import (
	"context"
	"encoding/json"
	"net/http"
	"strconv"
	"time"

	actool "github.com/Autumn-27/norma/tool"
	"github.com/whyujjwal/superartex/db"
)

func (s *Server) scanJobs() *ScanJobs {
	s.jobsOnce.Do(func() {
		s.jobs = NewScanJobs(s.m.PG())
	})
	return s.jobs
}

func (s *Server) scanJobTools() []actool.CoreTool {
	return []actool.CoreTool{
		s.toolStartScanJob(),
		s.toolGetScanJob(),
		s.toolWaitScanJob(),
		s.toolCancelScanJob(),
	}
}

func (s *Server) toolStartScanJob() actool.CoreTool {
	return wrTool("start_scan_job",
		"Run an allowlisted recon or posture scanner in the background and return immediately with a job id. "+
			"Identical successful runs on the same task are returned from cache and are not executed again. "+
			"The tool is paused for the task after repeated failures. "+
			"Pass argv as args, never a shell string. Declare the target host, URL, or CIDR inside args so the target gate can see it.",
		objSchema(map[string]any{
			"task_id": strParam("Task id this scan belongs to"),
			"tool":    strParam("Allowlisted binary name, for example nmap, nuclei, httpx, trivy"),
			"args": map[string]any{
				"type":        "array",
				"items":       map[string]any{"type": "string"},
				"description": "Argv after the binary. No shell syntax.",
			},
		}, "task_id", "tool", "args"),
		func(ctx context.Context, in json.RawMessage) (actool.Result, error) {
			task, tool, args, err := scanJobFromInput(in)
			if err != nil {
				return actool.Errorf(err.Error()), nil
			}
			job, err := s.scanJobs().Start(ctx, task, tool, args)
			if err != nil {
				return actool.Errorf(err.Error()), nil
			}
			return jsonResult(job)
		})
}

func (s *Server) toolGetScanJob() actool.CoreTool {
	return roTool("get_scan_job",
		"Read one background scan job by id: status, output, and error.",
		objSchema(map[string]any{"id": strParam("Job id returned by start_scan_job")}, "id"),
		func(_ context.Context, in json.RawMessage) (actool.Result, error) {
			var body struct {
				ID string `json:"id"`
			}
			_ = json.Unmarshal(in, &body)
			job, err := s.scanJobs().pg.GetScanJob(body.ID)
			if err != nil {
				return actool.Errorf(err.Error()), nil
			}
			if job == nil {
				return actool.Errorf("job not found"), nil
			}
			return jsonResult(job)
		})
}

func (s *Server) toolWaitScanJob() actool.CoreTool {
	return roTool("wait_scan_job",
		"Wait until a background scan job finishes, or until timeout_seconds elapses. Returns the job either way.",
		objSchema(map[string]any{
			"id":              strParam("Job id"),
			"timeout_seconds": map[string]any{"type": "integer", "description": "Max seconds to wait. Default 1800, max 7200."},
		}, "id"),
		func(ctx context.Context, in json.RawMessage) (actool.Result, error) {
			var body struct {
				ID      string `json:"id"`
				Timeout int    `json:"timeout_seconds"`
			}
			_ = json.Unmarshal(in, &body)
			job, err := s.scanJobs().Wait(ctx, body.ID, time.Duration(body.Timeout)*time.Second)
			if err != nil {
				return actool.Errorf(err.Error()), nil
			}
			if job == nil {
				return actool.Errorf("job not found"), nil
			}
			return jsonResult(job)
		})
}

func (s *Server) toolCancelScanJob() actool.CoreTool {
	return wrTool("cancel_scan_job",
		"Cancel a queued or running background scan job.",
		objSchema(map[string]any{"id": strParam("Job id")}, "id"),
		func(_ context.Context, in json.RawMessage) (actool.Result, error) {
			var body struct {
				ID string `json:"id"`
			}
			_ = json.Unmarshal(in, &body)
			job, err := s.scanJobs().Cancel(body.ID)
			if err != nil {
				return actool.Errorf(err.Error()), nil
			}
			if job == nil {
				return actool.Errorf("job not found"), nil
			}
			return jsonResult(job)
		})
}

func (s *Server) seedScanJobTools() {
	agents, _ := json.Marshal([]string{"worker", "pentest", "auto"})
	for _, t := range s.scanJobTools() {
		schema, _ := json.Marshal(t.InputSchema())
		_ = s.m.PG().SeedTool(t.Name(), t.Description(), schema, agents)
	}
}

func (s *Server) listScanJobs(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	limit, _ := strconv.Atoi(q.Get("limit"))
	jobs, err := s.scanJobs().pg.ListScanJobs(q.Get("task"), q.Get("status"), limit)
	if err != nil {
		writeErr(w, 500, err.Error())
		return
	}
	if jobs == nil {
		jobs = []db.ScanJob{}
	}
	writeJSON(w, 200, map[string]any{"jobs": jobs})
}

func (s *Server) cancelScanJobHTTP(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	job, err := s.scanJobs().Cancel(id)
	if err != nil {
		writeErr(w, 500, err.Error())
		return
	}
	if job == nil {
		writeErr(w, 404, "job not found")
		return
	}
	writeJSON(w, 200, job)
}

func (s *Server) streamScanJobs(w http.ResponseWriter, r *http.Request) {
	flusher, ok := w.(http.Flusher)
	if !ok {
		writeErr(w, 500, "streaming unsupported")
		return
	}
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("X-Accel-Buffering", "no")
	ch, unsub := s.scanJobs().Subscribe()
	defer unsub()
	send := func() bool {
		jobs, err := s.scanJobs().pg.ListScanJobs(r.URL.Query().Get("task"), "", 100)
		if err != nil {
			return false
		}
		if jobs == nil {
			jobs = []db.ScanJob{}
		}
		b, _ := json.Marshal(map[string]any{"jobs": jobs})
		if _, err := w.Write([]byte("data: " + string(b) + "\n\n")); err != nil {
			return false
		}
		flusher.Flush()
		return true
	}
	if !send() {
		return
	}
	ticker := time.NewTicker(5 * time.Second)
	defer ticker.Stop()
	for {
		select {
		case <-r.Context().Done():
			return
		case <-ch:
			if !send() {
				return
			}
		case <-ticker.C:
			if !send() {
				return
			}
		}
	}
}
