// Package report renders a deliverable Markdown report from the exploration
// graph: confirmed findings (with severity/evidence) (docs §15 P5).
package report

import (
	"encoding/json"
	"fmt"
	"sort"
	"strings"
	"time"

	"github.com/whyujjwal/superartex/db"
)

// Input bundles what the report needs.
type Input struct {
	Title       string
	Goal        string
	GeneratedAt time.Time
	AssetCounts map[string]int
	Findings    []*db.Node
	Coverage    *db.CoverageLedger // nil when the task's coverage feature is off
}

// reportMaxGaps caps the coverage gap list of the report; the rest is counted.
const reportMaxGaps = 200

type findingView struct {
	VulnClass string
	Name      string
	Severity  string
	Summary   string
	PoC       string
}

func parseFinding(n *db.Node) findingView {
	var p struct {
		VulnClass string `json:"vulnclass"`
		Name      string `json:"name"`
		Severity  string `json:"severity"`
		Summary   string `json:"summary"`
		Evidence  struct {
			PoC string `json:"poc"`
		} `json:"evidence"`
	}
	_ = json.Unmarshal(n.Payload, &p)
	return findingView{p.VulnClass, p.Name, p.Severity, p.Summary, p.Evidence.PoC}
}

func severityRank(severity string) int {
	switch severity {
	case db.SeverityCritical:
		return 0
	case db.SeverityHigh:
		return 1
	case db.SeverityMedium:
		return 2
	case db.SeverityLow:
		return 3
	default:
		return 4
	}
}

// Markdown renders the report.
func Markdown(in Input) string {
	var b strings.Builder
	fmt.Fprintf(&b, "# Penetration Test Report — %s\n\n", nz(in.Title, "Unnamed task"))
	fmt.Fprintf(&b, "- **Task goal**: %s\n", nz(in.Goal, "(unspecified)"))
	fmt.Fprintf(&b, "- **Generated at**: %s\n\n", in.GeneratedAt.Format("2006-01-02 15:04:05"))

	// summary
	fmt.Fprintf(&b, "## Summary\n\n")
	fmt.Fprintf(&b, "- Confirmed findings: **%d**\n", len(in.Findings))
	fmt.Fprintf(&b, "- Assets: ")
	var types []string
	for t := range in.AssetCounts {
		types = append(types, t)
	}
	sort.Strings(types)
	for i, t := range types {
		if i > 0 {
			b.WriteString(", ")
		}
		fmt.Fprintf(&b, "%s %d", t, in.AssetCounts[t])
	}
	b.WriteString("\n\n")

	// findings
	fmt.Fprintf(&b, "## Findings\n\n")
	if len(in.Findings) == 0 {
		b.WriteString("_No vulnerabilities confirmed this time._\n\n")
	} else {
		fs := make([]findingView, 0, len(in.Findings))
		for _, n := range in.Findings {
			fs = append(fs, parseFinding(n))
		}
		sort.SliceStable(fs, func(i, j int) bool { return severityRank(fs[i].Severity) < severityRank(fs[j].Severity) })
		for i, f := range fs {
			fmt.Fprintf(&b, "### %d. [%s] %s\n\n", i+1, strings.ToUpper(nz(f.Severity, "info")), nz(f.Name, nz(f.VulnClass, "Uncategorized")))
			fmt.Fprintf(&b, "%s\n\n", nz(f.Summary, ""))
			if f.PoC != "" {
				b.WriteString("**PoC / Evidence:**\n\n")
				writeMarkdownCodeBlock(&b, f.PoC)
			}
		}
	}

	if c := in.Coverage; c != nil {
		fmt.Fprintf(&b, "## Coverage gaps\n\n")
		if c.Completeness != nil {
			fmt.Fprintf(&b, "- **Completeness**: %s. %s\n", c.Completeness.State, c.Completeness.Caveat)
		}
		fmt.Fprintf(&b, "- Ledger entries: %d, open gaps: %d\n", len(c.Entries), len(c.Gaps))
		for i, g := range c.Gaps {
			if i == reportMaxGaps {
				fmt.Fprintf(&b, "- and %d more (see the coverage API)\n", len(c.Gaps)-reportMaxGaps)
				break
			}
			fmt.Fprintf(&b, "- %s\n", g)
		}
		b.WriteString("\n")
	}

	return b.String()
}

func writeMarkdownCodeBlock(b *strings.Builder, content string) {
	// A closing Markdown fence may be as long as the opening fence or longer.
	fenceLength, runLength := 3, 0
	for _, r := range content {
		if r == '`' {
			runLength++
			fenceLength = max(fenceLength, runLength+1)
		} else {
			runLength = 0
		}
	}
	fence := strings.Repeat("`", fenceLength)
	fmt.Fprintf(b, "%s\n%s\n%s\n\n", fence, content, fence)
}

func nz(s, d string) string {
	if strings.TrimSpace(s) == "" {
		return d
	}
	return s
}
