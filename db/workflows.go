package db

import (
	"database/sql"
	"encoding/json"
	"errors"
	"strings"
	"time"
)

var (
	ErrWorkflowInvalid  = errors.New("invalid workflow")
	ErrWorkflowNotFound = errors.New("workflow not found")
)

// WorkflowStep is one step of a workflow: a typed scan wrapper key plus its
// params, and what to do when the step's job fails.
type WorkflowStep struct {
	Tool      string         `json:"tool"`
	Params    map[string]any `json:"params"`
	OnFailure string         `json:"on_failure,omitempty"` // stop (default) | continue
}

type Workflow struct {
	ID          int64          `json:"id"`
	Name        string         `json:"name"`
	Description string         `json:"description"`
	Steps       []WorkflowStep `json:"steps"`
	CreatedAt   time.Time      `json:"created_at"`
	UpdatedAt   time.Time      `json:"updated_at"`
}

// StepResult records the outcome of one executed step.
type StepResult struct {
	Index      int    `json:"index"`
	Tool       string `json:"tool"`
	JobID      string `json:"job_id,omitempty"`
	Status     string `json:"status"`
	Error      string `json:"error,omitempty"`
	CachedFrom string `json:"cached_from,omitempty"`
}

type WorkflowRun struct {
	ID         int64        `json:"id"`
	WorkflowID int64        `json:"workflow_id"`
	TaskRef    string       `json:"task_id"`
	Status     string       `json:"status"`
	Steps      []StepResult `json:"step_results"`
	CreatedAt  time.Time    `json:"created_at"`
	FinishedAt *time.Time   `json:"finished_at,omitempty"`
}

const workflowCols = `id, name, description, steps, created_at, updated_at`

func scanWorkflow(row interface{ Scan(...any) error }) (Workflow, error) {
	var w Workflow
	var stepsRaw []byte
	if err := row.Scan(&w.ID, &w.Name, &w.Description, &stepsRaw, &w.CreatedAt, &w.UpdatedAt); err != nil {
		return w, err
	}
	w.Steps = []WorkflowStep{}
	if len(stepsRaw) > 0 {
		if err := json.Unmarshal(stepsRaw, &w.Steps); err != nil {
			return w, err
		}
		if w.Steps == nil {
			w.Steps = []WorkflowStep{}
		}
	}
	return w, nil
}

func normalizeSteps(steps []WorkflowStep) ([]WorkflowStep, error) {
	if len(steps) == 0 {
		return nil, ErrWorkflowInvalid
	}
	if len(steps) > 25 {
		return nil, ErrWorkflowInvalid
	}
	out := make([]WorkflowStep, 0, len(steps))
	for _, s := range steps {
		s.Tool = strings.TrimSpace(s.Tool)
		if s.Tool == "" {
			return nil, ErrWorkflowInvalid
		}
		if s.OnFailure != "continue" {
			s.OnFailure = "stop"
		}
		if s.Params == nil {
			s.Params = map[string]any{}
		}
		out = append(out, s)
	}
	return out, nil
}

func (d *DB) CreateWorkflow(name, description string, steps []WorkflowStep) (*Workflow, error) {
	name = strings.TrimSpace(name)
	if name == "" {
		return nil, ErrWorkflowInvalid
	}
	steps, err := normalizeSteps(steps)
	if err != nil {
		return nil, err
	}
	raw, err := json.Marshal(steps)
	if err != nil {
		return nil, err
	}
	w, err := scanWorkflow(d.QueryRow(`
INSERT INTO workflows(name, description, steps)
VALUES ($1,$2,$3) RETURNING `+workflowCols, name, strings.TrimSpace(description), raw))
	if err != nil {
		return nil, err
	}
	return &w, nil
}

func (d *DB) ListWorkflows() ([]Workflow, error) {
	rows, err := d.Query(`SELECT ` + workflowCols + ` FROM workflows ORDER BY updated_at DESC, id DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []Workflow
	for rows.Next() {
		w, err := scanWorkflow(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, w)
	}
	return out, rows.Err()
}

func (d *DB) GetWorkflow(id int64) (*Workflow, error) {
	w, err := scanWorkflow(d.QueryRow(`SELECT `+workflowCols+` FROM workflows WHERE id=$1`, id))
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &w, nil
}

func (d *DB) DeleteWorkflow(id int64) (bool, error) {
	res, err := d.Exec(`DELETE FROM workflows WHERE id=$1`, id)
	if err != nil {
		return false, err
	}
	n, _ := res.RowsAffected()
	return n > 0, nil
}

// InsertWorkflowRun creates a run row and returns its id.
func (d *DB) InsertWorkflowRun(workflowID int64, taskRef string) (int64, error) {
	var id int64
	err := d.QueryRow(`
INSERT INTO workflow_runs(workflow_id, task_ref, status)
VALUES ($1,$2,'running') RETURNING id`, workflowID, taskRef).Scan(&id)
	return id, err
}

// FinishWorkflowRun stores the terminal status and per-step results.
func (d *DB) FinishWorkflowRun(id int64, status string, steps []StepResult) error {
	raw, err := json.Marshal(steps)
	if err != nil {
		return err
	}
	_, err = d.Exec(`
UPDATE workflow_runs SET status=$2, step_results=$3, finished_at=now() WHERE id=$1`,
		id, status, raw)
	return err
}

func (d *DB) ListWorkflowRuns(workflowID int64, limit int) ([]WorkflowRun, error) {
	if limit <= 0 || limit > 100 {
		limit = 25
	}
	rows, err := d.Query(`
SELECT id, workflow_id, task_ref, status, step_results, created_at, finished_at
FROM workflow_runs
WHERE ($1 = 0 OR workflow_id = $1)
ORDER BY created_at DESC LIMIT $2`, workflowID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []WorkflowRun
	for rows.Next() {
		var r WorkflowRun
		var stepsRaw []byte
		if err := rows.Scan(&r.ID, &r.WorkflowID, &r.TaskRef, &r.Status, &stepsRaw, &r.CreatedAt, &r.FinishedAt); err != nil {
			return nil, err
		}
		r.Steps = []StepResult{}
		if len(stepsRaw) > 0 {
			_ = json.Unmarshal(stepsRaw, &r.Steps)
			if r.Steps == nil {
				r.Steps = []StepResult{}
			}
		}
		out = append(out, r)
	}
	return out, rows.Err()
}
