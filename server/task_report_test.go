package server

import (
	"fmt"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"testing"

	"github.com/whyujjwal/superartex/db"
)

func TestTaskReport(t *testing.T) {
	dsn, _, err := db.DSN()
	if err != nil {
		t.Skip("test postgres not configured")
	}
	pg, err := db.Open(dsn)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = pg.Close() })

	s := &Server{m: &Manager{assets: pg.Assets(), tasks: map[string]*Task{}}}
	createTask := func(t *testing.T, name string, roots int) *Task {
		t.Helper()
		row, err := pg.CreateTask(name, "Report fixture", nil, 0, 0)
		if err != nil {
			t.Fatal(err)
		}
		t.Cleanup(func() {
			if _, err := pg.DeleteTaskCascade(row.ID, true, false); err != nil {
				t.Errorf("delete task %d: %v", row.ID, err)
			}
		})
		for i := range roots {
			_, err := s.m.assets.UpsertRootDomain(db.UpsertRootDomainReq{
				Domain: fmt.Sprintf("report-%d-%d.example.test", row.ID, i),
				TaskID: row.ID,
			})
			if err != nil {
				t.Fatal(err)
			}
		}
		task := &Task{
			ID: strconv.FormatInt(row.ID, 10), ExpID: row.ExplorationID, Description: row.Description, Goal: row.Goal,
			Store: pg.Exploration(row.ExplorationID), CoverageEnabled: row.CoverageEnabled,
		}
		s.m.tasks[task.ID] = task
		return task
	}
	getReport := func(s *Server, taskID string) *httptest.ResponseRecorder {
		rec := httptest.NewRecorder()
		s.getReport(rec, httptest.NewRequest(http.MethodGet, "/api/report?task="+taskID, nil))
		return rec
	}

	first := createTask(t, "First report", 1)
	second := createTask(t, "Second report", 2)
	t.Run("task-specific asset counts", func(t *testing.T) {
		for _, tc := range []struct {
			task *Task
			want string
		}{
			{first, "\n- Assets: root_domain 1\n"},
			{second, "\n- Assets: root_domain 2\n"},
		} {
			rec := getReport(s, tc.task.ID)
			if rec.Code != http.StatusOK || !strings.Contains(rec.Body.String(), tc.want) {
				t.Errorf("task %s report = HTTP %d %s, want HTTP 200 with %q", tc.task.ID, rec.Code, rec.Body.String(), tc.want)
			}
		}
	})
	t.Run("database read failure", func(t *testing.T) {
		closed, err := db.Open(dsn)
		if err != nil {
			t.Fatal(err)
		}
		if err := closed.Close(); err != nil {
			t.Fatal(err)
		}
		for _, tc := range []struct {
			name   string
			store  *db.ExplorationStore
			assets *db.AssetStore
		}{
			{"findings", closed.Exploration(first.ExpID), s.m.assets},
			{"asset counts", first.Store, closed.Assets()},
		} {
			t.Run(tc.name, func(t *testing.T) {
				task := &Task{ID: first.ID, Store: tc.store}
				failed := &Server{m: &Manager{assets: tc.assets, tasks: map[string]*Task{task.ID: task}}}
				rec := getReport(failed, task.ID)
				if rec.Code != http.StatusInternalServerError || rec.Body.String() != "{\"error\":\"could not generate report\"}\n" {
					t.Errorf("report with unavailable %s = HTTP %d %s, want generic HTTP 500", tc.name, rec.Code, rec.Body.String())
				}
			})
		}
	})
}
