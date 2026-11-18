package report

import (
	"encoding/csv"
	"slices"
	"strings"
	"testing"
	"time"
	"unicode/utf8"

	"github.com/whyujjwal/superartex/db"
)

func TestFindingFilenamePreservesShortNameFormat(t *testing.T) {
	finding := &db.DBFinding{ID: 101, Name: "Status/report", Severity: "high"}
	if got, want := FindingFilename(finding), "high_Status_report__101.md"; got != want {
		t.Errorf("filename = %q, want %q", got, want)
	}
}

func TestFindingFilenamePreservesUnicodeAndIDWhenShortened(t *testing.T) {
	title := strings.Repeat("報", 70)
	first := FindingFilename(&db.DBFinding{ID: 101, Name: title, Severity: "high"})
	second := FindingFilename(&db.DBFinding{ID: 102, Name: title, Severity: "high"})

	if !utf8.ValidString(first) || !strings.HasPrefix(first, "high_報") {
		t.Errorf("filename did not preserve its Unicode title: %q", first)
	}
	if len(first) > 124 {
		t.Errorf("filename length = %d bytes, want at most 124", len(first))
	}
	if first == second || !strings.HasSuffix(first, "__101.md") || !strings.HasSuffix(second, "__102.md") {
		t.Errorf("filenames lost their distinct IDs: %q and %q", first, second)
	}
}

func TestFindingExportsOrderUnrankedSeveritiesAfterLow(t *testing.T) {
	older := time.Unix(1, 0)
	newer := time.Unix(2, 0)
	ranked := []*db.DBFinding{
		{Name: "Low", Severity: "low", CreatedAt: older},
		{Name: "Critical", Severity: "critical", CreatedAt: older},
	}
	findings := append([]*db.DBFinding{
		{Name: "Info", Severity: "info", CreatedAt: newer},
		{Name: "Unrated", CreatedAt: older},
		{Name: "Unrecognized", Severity: "legacy", CreatedAt: newer},
	}, ranked...)
	want := []string{"Critical", "Low", "Info", "Unrecognized", "Unrated"}
	t.Run("Markdown", func(t *testing.T) {
		markdown := FindingsMarkdown(findings, newer)
		assertFindingHeadingOrder(t, markdown, want)
		if !strings.Contains(markdown, "| Info / other | 3 |") {
			t.Error("Markdown severity summary is missing the three unranked findings")
		}
		if strings.Contains(FindingsMarkdown(ranked, newer), "| Info / other |") {
			t.Error("Markdown severity summary shows an unused Info / other row")
		}
	})
	t.Run("CSV", func(t *testing.T) {
		data := strings.TrimPrefix(string(FindingsCSV(findings)), "\uFEFF")
		rows, err := csv.NewReader(strings.NewReader(data)).ReadAll()
		if err != nil {
			t.Fatal(err)
		}
		var names []string
		for _, row := range rows[1:] {
			names = append(names, row[1])
		}
		if !slices.Equal(names, want) {
			t.Errorf("CSV finding order = %v, want %v", names, want)
		}
	})
}

func TestFindingsCSVExportsFormulaLikeValuesAsText(t *testing.T) {
	at := time.Date(2026, 11, 18, 9, 30, 0, 0, time.UTC)
	findings := []*db.DBFinding{
		{
			ID: 12, Name: "Routine, \"quoted\" title", VulnClass: "class", Severity: "low",
			CreatedAt: at, Summary: "First line\nSecond line",
		},
		{
			ID: 18, Name: "=1+1", VulnClass: "+class", Severity: "-legacy", Status: " @status",
			TaskDescription: "\tWorkspace", CreatedAt: at, Summary: "＝1+1",
			TrafficBindings: []db.FindingTrafficBinding{{ID: 7}, {ID: 8}},
		},
	}
	data := strings.TrimPrefix(string(FindingsCSV(findings)), "\uFEFF")
	rows, err := csv.NewReader(strings.NewReader(data)).ReadAll()
	if err != nil {
		t.Fatal(err)
	}
	want := [][]string{
		{"12", "Routine, \"quoted\" title", "class", "low", "pending", "", "2026-11-18 09:30:00", "First line\nSecond line", "0", ""},
		{"18", "'=1+1", "'+class", "'-legacy", "' @status", "'\tWorkspace", "2026-11-18 09:30:00", "'＝1+1", "2", "7,8"},
	}
	if !slices.EqualFunc(rows[1:], want, slices.Equal[[]string]) {
		t.Errorf("CSV data rows = %q, want %q", rows[1:], want)
	}
}

func TestTaskMarkdownPreservesUnrankedFindingOrder(t *testing.T) {
	findings := []*db.Node{
		{Payload: []byte(`{"name":"Info","severity":"info"}`)},
		{Payload: []byte(`{"name":"Unrated"}`)},
		{Payload: []byte(`{"name":"Unrecognized","severity":"legacy"}`)},
		{Payload: []byte(`{"name":"Low","severity":"low"}`)},
	}
	assertFindingHeadingOrder(t, Markdown(Input{Findings: findings}), []string{"Low", "Info", "Unrated", "Unrecognized"})
}

func assertFindingHeadingOrder(t *testing.T, markdown string, titles []string) {
	t.Helper()
	previous := -1
	for _, title := range titles {
		position := strings.Index(markdown, "] "+title+"\n")
		if position <= previous {
			t.Fatalf("want headings in order %v, got:\n%s", titles, markdown)
		}
		previous = position
	}
}

// The exported report carries the coverage gaps and the completeness caveat;
// nothing is added when the task's coverage feature is off (nil ledger).
func TestMarkdownCoverageGaps(t *testing.T) {
	l := db.BuildCoverageLedger([]db.CoverageEntry{{Surface: "/a", RiskArea: "xss", Outcome: db.OutcomeNeedsFollowUp}},
		[]string{"sqli"}, db.CoverageCompletenessFor("timeout", false, false, true))
	cases := []struct {
		name string
		l    *db.CoverageLedger
		want []string
	}{
		{"ledger", l, []string{"## Coverage gaps", "timeout", "Incomplete scan", "open gaps: 2", "- unrecorded_risk_class sqli", "- needs_follow_up /a xss"}},
		{"coverage off", nil, nil},
	}
	for _, c := range cases {
		md := Markdown(Input{Title: "t", Coverage: c.l})
		if c.want == nil && strings.Contains(md, "Coverage gaps") {
			t.Fatalf("%s: unexpected coverage section", c.name)
		}
		for _, w := range c.want {
			if !strings.Contains(md, w) {
				t.Errorf("%s: missing %q in\n%s", c.name, w, md)
			}
		}
	}
}

// The report lists at most reportMaxGaps gaps, then a count line.
func TestMarkdownCoverageGapsCap(t *testing.T) {
	var entries []db.CoverageEntry
	for i := 0; i < reportMaxGaps+30; i++ {
		entries = append(entries, db.CoverageEntry{Surface: "/p", RiskArea: "xss", Outcome: db.OutcomeNeedsFollowUp})
	}
	md := Markdown(Input{Title: "t", Coverage: db.BuildCoverageLedger(entries, nil, db.CoverageCompleteness{})})
	if n := strings.Count(md, "\n- needs_follow_up /p xss"); n != reportMaxGaps {
		t.Fatalf("listed %d gaps, want %d", n, reportMaxGaps)
	}
	if !strings.Contains(md, "- and 30 more (see the coverage API)") {
		t.Fatalf("missing count line in\n%s", md)
	}
}
