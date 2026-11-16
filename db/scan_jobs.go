package db

import (
	"database/sql"
	"encoding/json"
	"errors"
	"time"
)

// ScanJob is one allowlisted background scanner run.
type ScanJob struct {
	ID         string     `json:"id"`
	TaskRef    string     `json:"task_id"`
	Tool       string     `json:"tool"`
	Args       []string   `json:"args"`
	ArgsHash   string     `json:"-"`
	Status     string     `json:"status"`
	CachedFrom string     `json:"cached_from,omitempty"`
	Output     string     `json:"output,omitempty"`
	Error      string     `json:"error,omitempty"`
	ExitCode   *int       `json:"exit_code,omitempty"`
	CreatedAt  time.Time  `json:"created_at"`
	StartedAt  *time.Time `json:"started_at,omitempty"`
	FinishedAt *time.Time `json:"finished_at,omitempty"`
}

const scanJobCols = `id, task_ref, tool, args, args_hash, status, cached_from, output, error, exit_code, created_at, started_at, finished_at`

func scanScanJob(row interface{ Scan(...any) error }) (ScanJob, error) {
	var j ScanJob
	var argsRaw []byte
	var cached sql.NullString
	var exit sql.NullInt32
	var started, finished sql.NullTime
	if err := row.Scan(&j.ID, &j.TaskRef, &j.Tool, &argsRaw, &j.ArgsHash, &j.Status, &cached, &j.Output, &j.Error, &exit, &j.CreatedAt, &started, &finished); err != nil {
		return j, err
	}
	_ = json.Unmarshal(argsRaw, &j.Args)
	if j.Args == nil {
		j.Args = []string{}
	}
	if cached.Valid {
		j.CachedFrom = cached.String
	}
	if exit.Valid {
		n := int(exit.Int32)
		j.ExitCode = &n
	}
	if started.Valid {
		j.StartedAt = &started.Time
	}
	if finished.Valid {
		j.FinishedAt = &finished.Time
	}
	return j, nil
}

// InsertScanJob stores a new queued or already-finished (cache hit) job.
func (d *DB) InsertScanJob(j ScanJob) error {
	args, err := json.Marshal(j.Args)
	if err != nil {
		return err
	}
	var cached any
	if j.CachedFrom != "" {
		cached = j.CachedFrom
	}
	var exit any
	if j.ExitCode != nil {
		exit = *j.ExitCode
	}
	_, err = d.Exec(`
INSERT INTO scan_jobs(id, task_ref, tool, args, args_hash, status, cached_from, output, error, exit_code, started_at, finished_at)
VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
		j.ID, j.TaskRef, j.Tool, args, j.ArgsHash, j.Status, cached, j.Output, j.Error, exit, j.StartedAt, j.FinishedAt)
	return err
}

// FindCachedScanJob returns the newest successful run of the same tool and args on the same task.
func (d *DB) FindCachedScanJob(taskRef, tool, argsHash string) (*ScanJob, error) {
	j, err := scanScanJob(d.QueryRow(`
SELECT `+scanJobCols+` FROM scan_jobs
WHERE task_ref=$1 AND tool=$2 AND args_hash=$3 AND status='succeeded' AND cached_from IS NULL
ORDER BY finished_at DESC NULLS LAST, created_at DESC
LIMIT 1`, taskRef, tool, argsHash))
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &j, nil
}

// GetScanJob loads one job by id.
func (d *DB) GetScanJob(id string) (*ScanJob, error) {
	j, err := scanScanJob(d.QueryRow(`SELECT `+scanJobCols+` FROM scan_jobs WHERE id=$1`, id))
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &j, nil
}

// ListScanJobs returns the newest jobs, optionally filtered by task and status.
func (d *DB) ListScanJobs(taskRef, status string, limit int) ([]ScanJob, error) {
	if limit <= 0 || limit > 200 {
		limit = 50
	}
	rows, err := d.Query(`
SELECT `+scanJobCols+` FROM scan_jobs
WHERE ($1 = '' OR task_ref = $1) AND ($2 = '' OR status = $2)
ORDER BY created_at DESC
LIMIT $3`, taskRef, status, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []ScanJob
	for rows.Next() {
		j, err := scanScanJob(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, j)
	}
	return out, rows.Err()
}

// MarkScanJobRunning moves a queued job to running.
func (d *DB) MarkScanJobRunning(id string) error {
	_, err := d.Exec(`UPDATE scan_jobs SET status='running', started_at=now() WHERE id=$1 AND status='queued'`, id)
	return err
}

// FinishScanJob records a terminal state. status must be succeeded, failed, or cancelled.
func (d *DB) FinishScanJob(id, status, output, errText string, exit *int) error {
	var exitVal any
	if exit != nil {
		exitVal = *exit
	}
	_, err := d.Exec(`
UPDATE scan_jobs
SET status=$2, output=$3, error=$4, exit_code=$5, finished_at=now()
WHERE id=$1 AND status IN ('queued','running')`, id, status, output, errText, exitVal)
	return err
}

// FailInterruptedScanJobs marks jobs left running by a previous process as failed.
func (d *DB) FailInterruptedScanJobs() error {
	_, err := d.Exec(`
UPDATE scan_jobs
SET status='failed', error='interrupted by process restart', finished_at=now()
WHERE status IN ('queued','running')`)
	return err
}
