package server

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	actool "github.com/Autumn-27/norma/tool"
)

// typedScanSpec is one typed wrapper over the allowlisted scan runner. The
// wrapper gives the model a structured parameter schema per tool (the value of
// the per-tool-function approach) while execution stays on the one gated
// runner: same allowlist, same cache, same concurrency caps. Only recon and
// posture binaries get a wrapper; interactive attack tools (sqlmap, hashcat,
// hydra, john) deliberately do not — those stay on the approval-gated Bash path.
type typedScanSpec struct {
	key      string // tool name exposed to agents, e.g. "nmap_scan"
	bin      string // allowlisted binary the wrapper runs
	desc     string
	props    map[string]any // JSON-schema properties (shared per-kind helpers below)
	required []string
	args     func(p map[string]any) []string
}

// typedScanSpecs is the typed wrapper catalog. Binaries here must also appear in
// scanAllowlist — enforced by TestTypedScanSpecsAreAllowlisted.
var typedScanSpecs = []typedScanSpec{
	{
		key: "nmap_scan", bin: "nmap",
		desc: "nmap port and service scan of one in-scope host or small range.",
		props: map[string]any{
			"task_id":         strParam("Task id this scan belongs to"),
			"target":          strParam("Host, IP, or small CIDR in scope, e.g. 203.0.113.10"),
			"ports":           strParam("Port list, e.g. 22,80,443. Empty = top ports"),
			"service_version": boolParam("Add -sV service/version detection"),
		},
		required: []string{"task_id", "target"},
		args: func(p map[string]any) []string {
			out := []string{}
			if b, _ := p["service_version"].(bool); b {
				out = append(out, "-sV")
			}
			if s := strField(p, "ports"); s != "" {
				out = append(out, "-p", s)
			}
			return append(out, strField(p, "target"))
		},
	},
	{
		key: "rustscan_ports", bin: "rustscan",
		desc: "rustscan fast port discovery on one host. Open ports should be handed to nmap_scan afterwards.",
		props: map[string]any{
			"task_id": strParam("Task id this scan belongs to"),
			"target":  strParam("Host or IP in scope"),
		},
		required: []string{"task_id", "target"},
		args:     func(p map[string]any) []string { return []string{"-a", strField(p, "target")} },
	},
	{
		key: "masscan_ports", bin: "masscan",
		desc: "masscan sweep of one in-scope CIDR. High rate: only where the rules of engagement allow it.",
		props: map[string]any{
			"task_id": strParam("Task id this scan belongs to"),
			"target":  strParam("CIDR in scope, e.g. 203.0.113.0/24"),
			"ports":   strParam("Ports to sweep, e.g. 80,443"),
			"rate":    intParam("Packets per second (default 100)"),
		},
		required: []string{"task_id", "target", "ports"},
		args: func(p map[string]any) []string {
			rate := intField(p, "rate")
			if rate <= 0 {
				rate = 100
			}
			return []string{strField(p, "target"), "-p", strField(p, "ports"), "--rate", fmt.Sprint(rate)}
		},
	},
	{
		key: "arp_scan_localnet", bin: "arp-scan",
		desc: "arp-scan of the attached local segment. Lab networks only.",
		props: map[string]any{
			"task_id": strParam("Task id this scan belongs to"),
		},
		required: []string{"task_id"},
		args:     func(p map[string]any) []string { return []string{"--localnet"} },
	},
	{
		key: "httpx_probe", bin: "httpx",
		desc: "httpx probe of one URL: does it answer HTTP, with what status and title.",
		props: map[string]any{
			"task_id": strParam("Task id this scan belongs to"),
			"url":     strParam("Base URL in scope, e.g. https://app.example.com"),
		},
		required: []string{"task_id", "url"},
		args:     func(p map[string]any) []string { return []string{"-u", strField(p, "url"), "-title", "-sc"} },
	},
	{
		key: "gobuster_dir", bin: "gobuster",
		desc: "gobuster directory discovery on one base URL.",
		props: map[string]any{
			"task_id":  strParam("Task id this scan belongs to"),
			"url":      strParam("Base URL in scope"),
			"wordlist": strParam("Wordlist path (default /usr/share/seclists/Discovery/Web-Content/common.txt)"),
			"threads":  intParam("Thread cap (default 10)"),
		},
		required: []string{"task_id", "url"},
		args: func(p map[string]any) []string {
			wl := strField(p, "wordlist")
			if wl == "" {
				wl = "/usr/share/seclists/Discovery/Web-Content/common.txt"
			}
			th := intField(p, "threads")
			if th <= 0 {
				th = 10
			}
			return []string{"dir", "-u", strField(p, "url"), "-w", wl, "-t", fmt.Sprint(th)}
		},
	},
	{
		key: "ffuf_fuzz", bin: "ffuf",
		desc: "ffuf path fuzzing of one URL containing FUZZ.",
		props: map[string]any{
			"task_id":      strParam("Task id this scan belongs to"),
			"url":          strParam("URL with the FUZZ marker, e.g. https://app.example.com/FUZZ"),
			"wordlist":     strParam("Wordlist path"),
			"match_status": strParam("Status codes to keep, e.g. 200,301,403"),
		},
		required: []string{"task_id", "url", "wordlist"},
		args: func(p map[string]any) []string {
			out := []string{"-u", strField(p, "url"), "-w", strField(p, "wordlist"), "-t", "10"}
			if s := strField(p, "match_status"); s != "" {
				out = append(out, "-mc", s)
			}
			return out
		},
	},
	{
		key: "feroxbuster_dir", bin: "feroxbuster",
		desc: "feroxbuster content discovery on one base URL.",
		props: map[string]any{
			"task_id":  strParam("Task id this scan belongs to"),
			"url":      strParam("Base URL in scope"),
			"wordlist": strParam("Wordlist path"),
		},
		required: []string{"task_id", "url"},
		args: func(p map[string]any) []string {
			out := []string{"-u", strField(p, "url"), "--rate-limit", "10"}
			if s := strField(p, "wordlist"); s != "" {
				out = append(out, "-w", s)
			}
			return out
		},
	},
	{
		key: "dirsearch_dir", bin: "dirsearch",
		desc: "dirsearch directory discovery on one base URL.",
		props: map[string]any{
			"task_id": strParam("Task id this scan belongs to"),
			"url":     strParam("Base URL in scope"),
		},
		required: []string{"task_id", "url"},
		args:     func(p map[string]any) []string { return []string{"-u", strField(p, "url"), "--exclude-status=404"} },
	},
	{
		key: "nuclei_scan", bin: "nuclei",
		desc: "nuclei template scan of one in-scope URL, medium severity and up by default.",
		props: map[string]any{
			"task_id":  strParam("Task id this scan belongs to"),
			"url":      strParam("Target URL in scope"),
			"severity": strParam("Severity filter (default medium,high,critical)"),
		},
		required: []string{"task_id", "url"},
		args: func(p map[string]any) []string {
			sev := strField(p, "severity")
			if sev == "" {
				sev = "medium,high,critical"
			}
			return []string{"-u", strField(p, "url"), "-severity", sev, "-rl", "10", "-c", "5"}
		},
	},
	{
		key: "nikto_scan", bin: "nikto",
		desc: "nikto web server check of one URL. Only where the program allows active scanning.",
		props: map[string]any{
			"task_id": strParam("Task id this scan belongs to"),
			"url":     strParam("Target URL in scope"),
		},
		required: []string{"task_id", "url"},
		args:     func(p map[string]any) []string { return []string{"-h", strField(p, "url")} },
	},
	{
		key: "wpscan_enum", bin: "wpscan",
		desc: "wpscan enumeration of one WordPress site the program owns or lists.",
		props: map[string]any{
			"task_id":   strParam("Task id this scan belongs to"),
			"url":       strParam("WordPress URL in scope"),
			"enumerate": strParam("What to enumerate (default vp,vt)"),
		},
		required: []string{"task_id", "url"},
		args: func(p map[string]any) []string {
			en := strField(p, "enumerate")
			if en == "" {
				en = "vp,vt"
			}
			return []string{"--url", strField(p, "url"), "--enumerate", en}
		},
	},
	{
		key: "waf_detect", bin: "wafw00f",
		desc: "wafw00f WAF fingerprint of one URL. Run this before choosing scan rates.",
		props: map[string]any{
			"task_id": strParam("Task id this scan belongs to"),
			"url":     strParam("Target URL in scope"),
		},
		required: []string{"task_id", "url"},
		args:     func(p map[string]any) []string { return []string{strField(p, "url")} },
	},
	{
		key: "dalfox_xss", bin: "dalfox",
		desc: "dalfox XSS check of one URL you already discovered.",
		props: map[string]any{
			"task_id": strParam("Task id this scan belongs to"),
			"url":     strParam("Target URL in scope"),
		},
		required: []string{"task_id", "url"},
		args:     func(p map[string]any) []string { return []string{"url", strField(p, "url")} },
	},
	{
		key: "subfinder_enum", bin: "subfinder",
		desc: "subfinder passive subdomain enumeration of one root domain.",
		props: map[string]any{
			"task_id": strParam("Task id this scan belongs to"),
			"domain":  strParam("Root domain in scope, e.g. example.com"),
		},
		required: []string{"task_id", "domain"},
		args:     func(p map[string]any) []string { return []string{"-d", strField(p, "domain"), "-silent"} },
	},
	{
		key: "amass_enum", bin: "amass",
		desc: "amass passive enumeration of one domain, when subfinder was not enough.",
		props: map[string]any{
			"task_id": strParam("Task id this scan belongs to"),
			"domain":  strParam("Root domain in scope"),
		},
		required: []string{"task_id", "domain"},
		args:     func(p map[string]any) []string { return []string{"enum", "-passive", "-d", strField(p, "domain")} },
	},
	{
		key: "theharvester_search", bin: "theHarvester",
		desc: "theHarvester public-source email and host collection for one domain.",
		props: map[string]any{
			"task_id": strParam("Task id this scan belongs to"),
			"domain":  strParam("Root domain in scope"),
			"sources": strParam("Source list (default crtsh)"),
		},
		required: []string{"task_id", "domain"},
		args: func(p map[string]any) []string {
			src := strField(p, "sources")
			if src == "" {
				src = "crtsh"
			}
			return []string{"-d", strField(p, "domain"), "-b", src}
		},
	},
	{
		key: "sherlock_check", bin: "sherlock",
		desc: "sherlock username search. Only for a username the operator named in the task.",
		props: map[string]any{
			"task_id":  strParam("Task id this scan belongs to"),
			"username": strParam("Username the operator named"),
		},
		required: []string{"task_id", "username"},
		args:     func(p map[string]any) []string { return []string{strField(p, "username")} },
	},
	{
		key: "trivy_scan", bin: "trivy",
		desc: "trivy scan of one container image or filesystem path.",
		props: map[string]any{
			"task_id": strParam("Task id this scan belongs to"),
			"mode":    strParam("image or fs"),
			"target":  strParam("Image reference (e.g. registry/app:1.0) or path"),
		},
		required: []string{"task_id", "mode", "target"},
		args: func(p map[string]any) []string {
			mode := strField(p, "mode")
			if mode != "image" && mode != "fs" {
				mode = "image"
			}
			return []string{mode, strField(p, "target")}
		},
	},
	{
		key: "kube_bench_check", bin: "kube-bench",
		desc: "kube-bench CIS benchmark run against a cluster the task is allowed to read.",
		props: map[string]any{
			"task_id":   strParam("Task id this scan belongs to"),
			"benchmark": strParam("Benchmark version (default cis-1.8)"),
		},
		required: []string{"task_id"},
		args: func(p map[string]any) []string {
			b := strField(p, "benchmark")
			if b == "" {
				b = "cis-1.8"
			}
			return []string{"run", "--benchmark", b}
		},
	},
	{
		key: "kube_hunter_review", bin: "kube-hunter",
		desc: "kube-hunter cluster review. Passive by default; active checks need the program to allow them.",
		props: map[string]any{
			"task_id": strParam("Task id this scan belongs to"),
			"active":  boolParam("Enable active checks (only with explicit permission)"),
		},
		required: []string{"task_id"},
		args: func(p map[string]any) []string {
			if b, _ := p["active"].(bool); b {
				return []string{"--active"}
			}
			return []string{"--passive"}
		},
	},
	{
		key: "prowler_check", bin: "prowler",
		desc: "prowler configuration check of one cloud provider the task has credentials for.",
		props: map[string]any{
			"task_id":  strParam("Task id this scan belongs to"),
			"provider": strParam("aws | azure | gcp"),
			"service":  strParam("Limit to one service family, e.g. s3, iam"),
		},
		required: []string{"task_id", "provider"},
		args: func(p map[string]any) []string {
			out := []string{strField(p, "provider")}
			if s := strField(p, "service"); s != "" {
				out = append(out, "--service", s)
			}
			return out
		},
	},
	{
		key: "scout_check", bin: "scout",
		desc: "Scout Suite multi-cloud configuration report of one provider.",
		props: map[string]any{
			"task_id":  strParam("Task id this scan belongs to"),
			"provider": strParam("aws | azure | gcp | alibaba | oci"),
		},
		required: []string{"task_id", "provider"},
		args:     func(p map[string]any) []string { return []string{strField(p, "provider")} },
	},
	{
		key: "binwalk_scan", bin: "binwalk",
		desc: "binwalk signature scan of one file in the task workspace.",
		props: map[string]any{
			"task_id": strParam("Task id this scan belongs to"),
			"file":    strParam("File path inside the task workspace"),
		},
		required: []string{"task_id", "file"},
		args:     func(p map[string]any) []string { return []string{strField(p, "file")} },
	},
	{
		key: "exiftool_meta", bin: "exiftool",
		desc: "exiftool metadata read of one file in the task workspace.",
		props: map[string]any{
			"task_id": strParam("Task id this scan belongs to"),
			"file":    strParam("File path inside the task workspace"),
		},
		required: []string{"task_id", "file"},
		args:     func(p map[string]any) []string { return []string{strField(p, "file")} },
	},
}

func boolParam(desc string) map[string]any {
	return map[string]any{"type": "boolean", "description": desc}
}

func intParam(desc string) map[string]any {
	return map[string]any{"type": "integer", "description": desc}
}

func strField(p map[string]any, key string) string {
	s, _ := p[key].(string)
	return strings.TrimSpace(s)
}

func intField(p map[string]any, key string) int {
	switch v := p[key].(type) {
	case float64:
		return int(v)
	case int:
		return v
	}
	return 0
}

// propsWithWait returns the spec's parameter schema plus the shared wait_seconds
// option, so the seeded tools-table schema matches what the running tool takes.
func (s typedScanSpec) propsWithWait() map[string]any {
	props := make(map[string]any, len(s.props)+1)
	for k, v := range s.props {
		props[k] = v
	}
	props["wait_seconds"] = intParam("Optional: block until the job finishes, at most this many seconds. Default: return immediately.")
	return props
}

func scanSpecByKey(key string) (typedScanSpec, bool) {
	for _, s := range typedScanSpecs {
		if s.key == key {
			return s, true
		}
	}
	return typedScanSpec{}, false
}

// typedScanTools builds one CoreTool per catalog entry. Each wrapper validates
// its required params, maps them to argv through the spec, and submits through
// the scan runner, so the result is an ordinary background job: cached, capped,
// visible on Processes, cancellable.
func (s *Server) typedScanTools() []actool.CoreTool {
	out := make([]actool.CoreTool, 0, len(typedScanSpecs))
	for _, spec := range typedScanSpecs {
		out = append(out, s.buildTypedScanTool(spec))
	}
	return out
}

func (s *Server) buildTypedScanTool(spec typedScanSpec) actool.CoreTool {
	return wrTool(spec.key,
		spec.desc+" Returns the background job; poll with get_scan_job when wait_seconds is not set.",
		objSchema(spec.propsWithWait(), spec.required...),
		func(ctx context.Context, in json.RawMessage) (actool.Result, error) {
			var p map[string]any
			if err := json.Unmarshal(in, &p); err != nil {
				return actool.Errorf("invalid arguments: " + err.Error()), nil
			}
			taskRef := strField(p, "task_id")
			if taskRef == "" {
				return actool.Errorf("task_id is required"), nil
			}
			for _, req := range spec.required {
				if req == "task_id" {
					continue
				}
				if strField(p, req) == "" {
					return actool.Errorf(req + " is required"), nil
				}
			}
			args := spec.args(p)
			job, err := s.scanJobs().Start(ctx, taskRef, spec.bin, args)
			if err != nil {
				return actool.Errorf(err.Error()), nil
			}
			if wait := intField(p, "wait_seconds"); wait > 0 {
				if done, err := s.scanJobs().Wait(ctx, job.ID, time.Duration(wait)*time.Second); err == nil && done != nil {
					job = done
				}
			}
			return jsonResult(job)
		})
}
