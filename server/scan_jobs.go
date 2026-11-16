package server

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"os/exec"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/whyujjwal/superartex/db"
)

const (
	scanJobGlobalLimit  = 4
	scanJobPerToolLimit = 2
	scanJobFailLimit    = 3
	scanJobOutputLimit  = 256 << 10
	scanJobDefaultWait  = 30 * time.Minute
	scanJobMaxWait      = 2 * time.Hour
)

// scanAllowlist is the only set of binaries a background scan job may exec.
// Credential attacks, exploit tooling, and listeners are intentionally absent:
// those stay on the interactive Bash path under the existing approval rules,
// and are not given a second runner here.
var scanAllowlist = map[string]struct{}{
	"nmap": {}, "rustscan": {}, "masscan": {}, "arp-scan": {},
	"gobuster": {}, "ffuf": {}, "feroxbuster": {}, "dirsearch": {}, "httpx": {},
	"nuclei": {}, "nikto": {}, "wpscan": {}, "wafw00f": {}, "dalfox": {},
	"subfinder": {}, "amass": {}, "theHarvester": {}, "sherlock": {},
	"prowler": {}, "scout": {}, "trivy": {}, "kube-hunter": {}, "kube-bench": {},
	"binwalk": {}, "exiftool": {}, "volatility3": {}, "steghide": {}, "zsteg": {},
}

// ScanJobs runs allowlisted scanners in the background, caches identical
// successful runs on the same task, and pauses a tool after repeated failures.
type ScanJobs struct {
	pg   *db.DB
	exec func(ctx context.Context, bin string, args []string) (string, int, error)

	mu        sync.Mutex
	running   map[string]context.CancelFunc
	global    chan struct{}
	perTool   map[string]chan struct{}
	fails     map[string]int
	openUntil map[string]time.Time
	subs      map[chan struct{}]struct{}
}

func NewScanJobs(pg *db.DB) *ScanJobs {
	j := &ScanJobs{
		pg:        pg,
		running:   map[string]context.CancelFunc{},
		global:    make(chan struct{}, scanJobGlobalLimit),
		perTool:   map[string]chan struct{}{},
		fails:     map[string]int{},
		openUntil: map[string]time.Time{},
		subs:      map[chan struct{}]struct{}{},
	}
	j.exec = j.execAllowlisted
	if pg != nil {
		_ = pg.FailInterruptedScanJobs()
	}
	return j
}

func scanArgsHash(tool string, args []string) string {
	sum := sha256.Sum256([]byte(tool + "\x00" + strings.Join(args, "\x00")))
	return hex.EncodeToString(sum[:])
}

func validateScanArgs(args []string) error {
	if len(args) == 0 {
		return errors.New("args are required")
	}
	if len(args) > 64 {
		return errors.New("too many arguments")
	}
	for _, a := range args {
		if a == "" || len(a) > 512 || strings.ContainsRune(a, 0) || strings.ContainsAny(a, "\n\r|&;`$<>") {
			return errors.New("invalid argument")
		}
	}
	return nil
}

func (j *ScanJobs) toolSlot(tool string) chan struct{} {
	ch, ok := j.perTool[tool]
	if !ok {
		ch = make(chan struct{}, scanJobPerToolLimit)
		j.perTool[tool] = ch
	}
	return ch
}

func (j *ScanJobs) circuitOpen(task, tool string, now time.Time) bool {
	until, ok := j.openUntil[task+"\x00"+tool]
	return ok && now.Before(until)
}

func (j *ScanJobs) noteResult(task, tool string, ok bool, now time.Time) {
	key := task + "\x00" + tool
	if ok {
		j.fails[key] = 0
		delete(j.openUntil, key)
		return
	}
	j.fails[key]++
	if j.fails[key] >= scanJobFailLimit {
		j.openUntil[key] = now.Add(15 * time.Minute)
		j.fails[key] = 0
	}
}

func (j *ScanJobs) publish() {
	for ch := range j.subs {
		select {
		case ch <- struct{}{}:
		default:
		}
	}
}

// Subscribe returns a channel that receives a signal when any job changes.
func (j *ScanJobs) Subscribe() (<-chan struct{}, func()) {
	ch := make(chan struct{}, 1)
	j.mu.Lock()
	j.subs[ch] = struct{}{}
	j.mu.Unlock()
	return ch, func() {
		j.mu.Lock()
		delete(j.subs, ch)
		j.mu.Unlock()
	}
}

// Start queues a scan, or returns a cache hit without running it.
func (j *ScanJobs) Start(ctx context.Context, taskRef, tool string, args []string) (*db.ScanJob, error) {
	if _, ok := scanAllowlist[tool]; !ok {
		return nil, fmt.Errorf("tool %q is not an allowlisted scanner", tool)
	}
	if err := validateScanArgs(args); err != nil {
		return nil, err
	}
	if strings.TrimSpace(taskRef) == "" {
		return nil, errors.New("task_id is required")
	}
	hash := scanArgsHash(tool, args)
	if hit, err := j.pg.FindCachedScanJob(taskRef, tool, hash); err != nil {
		return nil, err
	} else if hit != nil {
		now := time.Now()
		cached := db.ScanJob{
			ID: uuid.NewString(), TaskRef: taskRef, Tool: tool, Args: args, ArgsHash: hash,
			Status: "succeeded", CachedFrom: hit.ID, Output: hit.Output, ExitCode: hit.ExitCode,
			CreatedAt: now, StartedAt: &now, FinishedAt: &now,
		}
		if err := j.pg.InsertScanJob(cached); err != nil {
			return nil, err
		}
		j.mu.Lock()
		j.publish()
		j.mu.Unlock()
		return &cached, nil
	}

	j.mu.Lock()
	if j.circuitOpen(taskRef, tool, time.Now()) {
		j.mu.Unlock()
		return nil, fmt.Errorf("tool %q is paused after repeated failures on this task", tool)
	}
	j.mu.Unlock()

	job := db.ScanJob{
		ID: uuid.NewString(), TaskRef: taskRef, Tool: tool, Args: append([]string(nil), args...),
		ArgsHash: hash, Status: "queued", CreatedAt: time.Now(),
	}
	if err := j.pg.InsertScanJob(job); err != nil {
		return nil, err
	}
	runCtx, cancel := context.WithTimeout(context.Background(), scanJobMaxWait)
	j.mu.Lock()
	j.running[job.ID] = cancel
	j.publish()
	j.mu.Unlock()
	log.Printf("[scan-job] queued id=%s task=%s tool=%s", job.ID, job.TaskRef, job.Tool)
	go j.run(runCtx, job)
	_ = ctx
	return &job, nil
}

func (j *ScanJobs) run(ctx context.Context, job db.ScanJob) {
	defer func() {
		j.mu.Lock()
		delete(j.running, job.ID)
		j.publish()
		j.mu.Unlock()
	}()

	j.mu.Lock()
	per := j.toolSlot(job.Tool)
	j.mu.Unlock()

	select {
	case <-ctx.Done():
		_ = j.pg.FinishScanJob(job.ID, "cancelled", "", "cancelled", nil)
		return
	case j.global <- struct{}{}:
	}
	defer func() { <-j.global }()
	select {
	case <-ctx.Done():
		_ = j.pg.FinishScanJob(job.ID, "cancelled", "", "cancelled", nil)
		return
	case per <- struct{}{}:
	}
	defer func() { <-per }()

	if err := j.pg.MarkScanJobRunning(job.ID); err != nil {
		return
	}
	j.mu.Lock()
	j.publish()
	j.mu.Unlock()

	out, code, err := j.exec(ctx, job.Tool, job.Args)
	if len(out) > scanJobOutputLimit {
		out = out[:scanJobOutputLimit] + "\n…truncated"
	}
	status := "succeeded"
	errText := ""
	if ctx.Err() != nil {
		status = "cancelled"
		errText = "cancelled"
	} else if err != nil || code != 0 {
		status = "failed"
		if err != nil {
			errText = err.Error()
		} else {
			errText = fmt.Sprintf("exit %d", code)
		}
	}
	exit := code
	_ = j.pg.FinishScanJob(job.ID, status, out, errText, &exit)
	log.Printf("[scan-job] finished id=%s task=%s tool=%s status=%s", job.ID, job.TaskRef, job.Tool, status)
	j.mu.Lock()
	j.noteResult(job.TaskRef, job.Tool, status == "succeeded", time.Now())
	j.publish()
	j.mu.Unlock()
}

// Cancel stops a queued or running job.
func (j *ScanJobs) Cancel(id string) (*db.ScanJob, error) {
	j.mu.Lock()
	cancel, ok := j.running[id]
	j.mu.Unlock()
	if ok {
		cancel()
	}
	job, err := j.pg.GetScanJob(id)
	if err != nil || job == nil {
		return job, err
	}
	if job.Status == "queued" || job.Status == "running" {
		_ = j.pg.FinishScanJob(id, "cancelled", job.Output, "cancelled", nil)
		job, err = j.pg.GetScanJob(id)
	}
	j.mu.Lock()
	j.publish()
	j.mu.Unlock()
	return job, err
}

func (j *ScanJobs) execAllowlisted(ctx context.Context, bin string, args []string) (string, int, error) {
	if _, ok := scanAllowlist[bin]; !ok {
		return "", 1, fmt.Errorf("tool %q is not allowlisted", bin)
	}
	path, err := exec.LookPath(bin)
	if err != nil {
		return "", 127, fmt.Errorf("%s is not installed", bin)
	}
	cmd := exec.CommandContext(ctx, path, args...)
	out, err := cmd.CombinedOutput()
	code := 0
	if cmd.ProcessState != nil {
		code = cmd.ProcessState.ExitCode()
	}
	if err != nil && ctx.Err() != nil {
		return string(out), code, ctx.Err()
	}
	if err != nil && code == 0 {
		code = 1
	}
	return string(out), code, nil
}

// Wait blocks until the job is terminal or the timeout elapses.
func (j *ScanJobs) Wait(ctx context.Context, id string, timeout time.Duration) (*db.ScanJob, error) {
	if timeout <= 0 {
		timeout = scanJobDefaultWait
	}
	if timeout > scanJobMaxWait {
		timeout = scanJobMaxWait
	}
	deadline := time.Now().Add(timeout)
	for {
		job, err := j.pg.GetScanJob(id)
		if err != nil || job == nil {
			return job, err
		}
		switch job.Status {
		case "succeeded", "failed", "cancelled":
			return job, nil
		}
		if time.Now().After(deadline) {
			return job, nil
		}
		select {
		case <-ctx.Done():
			return job, ctx.Err()
		case <-time.After(500 * time.Millisecond):
		}
	}
}

func scanJobFromInput(in json.RawMessage) (task, tool string, args []string, err error) {
	var body struct {
		TaskID string   `json:"task_id"`
		Tool   string   `json:"tool"`
		Args   []string `json:"args"`
	}
	if err = json.Unmarshal(in, &body); err != nil {
		return "", "", nil, err
	}
	return strings.TrimSpace(body.TaskID), strings.TrimSpace(body.Tool), body.Args, nil
}
