package report

import (
	"bytes"
	"encoding/csv"
	"fmt"
	"regexp"
	"sort"
	"strings"
	"time"
	"unicode"
	"unicode/utf8"

	"github.com/whyujjwal/superartex/db"
)

// Rendering for the findings page "Export": renders a batch of findings table rows
// into a summary Markdown, a single-finding Markdown, or CSV. JSON is serialized
// directly from DTOs at the server layer, not here.

// sortFindingsForExport sorts by severity descending, then by time descending, consistent with the summary report's grouping.
func sortFindingsForExport(fs []*db.DBFinding) {
	sort.SliceStable(fs, func(i, j int) bool {
		ri, rj := severityRank(fs[i].Severity), severityRank(fs[j].Severity)
		if ri != rj {
			return ri < rj // a lower severity rank means a more severe finding
		}
		return fs[i].CreatedAt.After(fs[j].CreatedAt)
	})
}

// findingTitle returns the vulnerability's readable title: name → class → "Uncategorized".
func findingTitle(f *db.DBFinding) string {
	return nz(f.Name, nz(f.VulnClass, "Uncategorized"))
}

// FindingsMarkdown combines a batch of findings into a summary report (summary + grouped by severity,
// each entry with class/status/owning task/evidence/detailed report).
func FindingsMarkdown(fs []*db.DBFinding, generatedAt time.Time) string {
	items := append([]*db.DBFinding(nil), fs...)
	sortFindingsForExport(items)

	var b strings.Builder
	b.WriteString("# Vulnerability Findings Summary Report\n\n")
	fmt.Fprintf(&b, "- **Generated at**: %s\n", generatedAt.Format("2006-01-02 15:04:05"))
	fmt.Fprintf(&b, "- **Total findings**: %d\n\n", len(items))

	// Summary: counts per severity.
	counts := map[string]int{}
	for _, f := range items {
		counts[f.Severity]++
	}
	b.WriteString("## Summary\n\n")
	b.WriteString("| Severity | Count |\n| --- | --- |\n")
	other := len(items)
	for _, s := range []struct{ key, label string }{
		{"critical", "Critical"}, {"high", "High"}, {"medium", "Medium"}, {"low", "Low"},
	} {
		count := counts[s.key]
		fmt.Fprintf(&b, "| %s | %d |\n", s.label, count)
		other -= count
	}
	if other > 0 {
		fmt.Fprintf(&b, "| Info / other | %d |\n", other)
	}
	b.WriteString("\n")

	if len(items) == 0 {
		b.WriteString("_No matching vulnerabilities._\n")
		return b.String()
	}

	b.WriteString("## Vulnerability Details\n\n")
	for i, f := range items {
		fmt.Fprintf(&b, "### %d. [%s] %s\n\n", i+1, strings.ToUpper(nz(f.Severity, "info")), findingTitle(f))
		if f.VulnClass != "" {
			fmt.Fprintf(&b, "- **Class**: %s\n", f.VulnClass)
		}
		fmt.Fprintf(&b, "- **Status**: %s\n", nz(f.Status, "pending"))
		if desc := strings.TrimSpace(f.TaskDescription); desc != "" {
			fmt.Fprintf(&b, "- **Task**: %s\n", desc)
		}
		fmt.Fprintf(&b, "- **Found at**: %s\n\n", f.CreatedAt.Format("2006-01-02 15:04:05"))
		if s := strings.TrimSpace(f.Summary); s != "" {
			fmt.Fprintf(&b, "%s\n\n", s)
		}
		if e := strings.TrimSpace(f.Evidence); e != "" {
			fmt.Fprintf(&b, "**Evidence:**\n\n```\n%s\n```\n\n", e)
		}
		if rep := strings.TrimSpace(f.Report); rep != "" {
			b.WriteString("**Detailed report:**\n\n")
			b.WriteString(rep)
			b.WriteString("\n\n")
		}
		b.WriteString(findingTrafficMarkdown(f, false))
		b.WriteString("---\n\n")
	}
	return b.String()
}

// SingleFindingMarkdown renders a single vulnerability as a standalone Markdown (used for "one file per vulnerability" packaging).
func SingleFindingMarkdown(f *db.DBFinding, generatedAt time.Time) string {
	var b strings.Builder
	fmt.Fprintf(&b, "# [%s] %s\n\n", strings.ToUpper(nz(f.Severity, "info")), findingTitle(f))
	if f.VulnClass != "" {
		fmt.Fprintf(&b, "- **Class**: %s\n", f.VulnClass)
	}
	fmt.Fprintf(&b, "- **Severity**: %s\n", nz(f.Severity, "info"))
	fmt.Fprintf(&b, "- **Status**: %s\n", nz(f.Status, "pending"))
	if desc := strings.TrimSpace(f.TaskDescription); desc != "" {
		fmt.Fprintf(&b, "- **Task**: %s\n", desc)
	}
	fmt.Fprintf(&b, "- **Found at**: %s\n", f.CreatedAt.Format("2006-01-02 15:04:05"))
	fmt.Fprintf(&b, "- **Generated at**: %s\n\n", generatedAt.Format("2006-01-02 15:04:05"))
	if s := strings.TrimSpace(f.Summary); s != "" {
		fmt.Fprintf(&b, "## Summary\n\n%s\n\n", s)
	}
	if e := strings.TrimSpace(f.Evidence); e != "" {
		fmt.Fprintf(&b, "## Evidence\n\n```\n%s\n```\n\n", e)
	}
	if rep := strings.TrimSpace(f.Report); rep != "" {
		b.WriteString("## Detailed Report\n\n")
		b.WriteString(rep)
		b.WriteString("\n")
	}
	b.WriteString(findingTrafficMarkdown(f, true))
	return b.String()
}

var unsafeFilenameChars = regexp.MustCompile(`[^\p{Han}\p{L}\p{N}._-]+`)

// FindingFilename generates a safe .md filename for "one file per vulnerability", e.g.
// `critical_SQL_injection__123.md`. The finding ID stays intact when the title is shortened.
func FindingFilename(f *db.DBFinding) string {
	sev := nz(f.Severity, "info")
	title := findingTitle(f)
	stem := unsafeFilenameChars.ReplaceAllString(sev+"_"+title, "_")
	stem = strings.TrimLeft(stem, "._")
	id := fmt.Sprint(f.ID)
	if stem == "" {
		return id + ".md"
	}
	suffix := "__" + id
	if end := 120 - len(suffix); len(stem) > end {
		for !utf8.RuneStart(stem[end]) {
			end--
		}
		stem = stem[:end]
	}
	return stem + suffix + ".md"
}

// FindingsCSV renders a batch of findings as CSV (with a UTF-8 BOM so Excel detects the encoding correctly).
// It omits the long report/evidence full text and keeps only summary-level fields; use Markdown/JSON export for full text.
func FindingsCSV(fs []*db.DBFinding) []byte {
	items := append([]*db.DBFinding(nil), fs...)
	sortFindingsForExport(items)

	var buf bytes.Buffer
	buf.WriteString("\xEF\xBB\xBF") // UTF-8 BOM
	w := csv.NewWriter(&buf)
	_ = w.Write([]string{"ID", "Name", "Class", "Severity", "Status", "Task", "Found At", "Summary", "Traffic Evidence Count", "Traffic Evidence IDs"})
	for _, f := range items {
		_ = w.Write([]string{
			fmt.Sprintf("%d", f.ID),
			spreadsheetText(findingTitle(f)),
			spreadsheetText(f.VulnClass),
			spreadsheetText(nz(f.Severity, "info")),
			spreadsheetText(nz(f.Status, "pending")),
			spreadsheetText(f.TaskDescription),
			f.CreatedAt.Format("2006-01-02 15:04:05"),
			spreadsheetText(strings.TrimSpace(f.Summary)),
			fmt.Sprint(len(f.TrafficBindings)), findingTrafficIDs(f),
		})
	}
	w.Flush()
	return buf.Bytes()
}

// spreadsheetText marks formula-like text as literal for spreadsheet imports.
// The CSV writer still handles field quoting and delimiters.
func spreadsheetText(value string) string {
	for _, r := range value {
		switch r {
		case '=', '+', '-', '@', '＝', '＋', '－', '＠', '\t', '\r', '\n', 0:
			return "'" + value
		}
		if !unicode.IsSpace(r) && !unicode.Is(unicode.Cf, r) {
			break
		}
	}
	return value
}

func findingTrafficIDs(f *db.DBFinding) string {
	ids := make([]string, 0, len(f.TrafficBindings))
	for _, b := range f.TrafficBindings {
		ids = append(ids, fmt.Sprint(b.ID))
	}
	return strings.Join(ids, ",")
}

func findingTrafficMarkdown(f *db.DBFinding, attachments bool) string {
	stale := f.Report != "" && f.EvidenceVersion != f.ReportEvidenceVersion
	if len(f.TrafficBindings) == 0 && !stale {
		return ""
	}
	var out strings.Builder
	out.WriteString("\n## Related Traffic Evidence\n\n")
	fmt.Fprintf(&out, "Evidence version: %d; bindings: %d.\n\n", f.EvidenceVersion, len(f.TrafficBindings))
	if stale {
		out.WriteString("The evidence has changed; the detailed report needs updating.\n\n")
	}
	for i, b := range f.TrafficBindings {
		fmt.Fprintf(&out, "%d. **Evidence #%d · %s** — `%s %s`, status %d\n", i+1, b.ID, b.Role, b.Snapshot.Method, strings.ReplaceAll(b.Snapshot.URL, "`", "%60"), b.Snapshot.Status)
		if b.Note != "" {
			fmt.Fprintf(&out, "   %s\n", strings.ReplaceAll(b.Note, "\n", "\n   "))
		}
		if attachments {
			fmt.Fprintf(&out, "   [Request message](evidence/%d/%d/request.http) · [Response message](evidence/%d/%d/response.http)\n", f.ID, b.ID, f.ID, b.ID)
		}
	}
	out.WriteString("\n")
	return out.String()
}
