package server

import (
	"strings"
	"testing"
	"time"
)

func TestScanAllowlistRejectsShell(t *testing.T) {
	for _, name := range []string{"bash", "sh", "python3", "nc", "hydra", "hashcat", "impacket-psexec"} {
		if _, ok := scanAllowlist[name]; ok {
			t.Fatalf("%s must not be an allowlisted background scanner", name)
		}
	}
	if _, ok := scanAllowlist["nmap"]; !ok {
		t.Fatal("nmap should be allowlisted")
	}
}

func TestScanArgsHashStable(t *testing.T) {
	a := scanArgsHash("nmap", []string{"-sV", "203.0.113.10"})
	b := scanArgsHash("nmap", []string{"-sV", "203.0.113.10"})
	c := scanArgsHash("nmap", []string{"-sV", "203.0.113.11"})
	if a != b || a == c || len(a) != 64 {
		t.Fatalf("hash a=%s b=%s c=%s", a, b, c)
	}
}

func TestValidateScanArgs(t *testing.T) {
	if err := validateScanArgs([]string{"-sV", "203.0.113.10"}); err != nil {
		t.Fatal(err)
	}
	if err := validateScanArgs(nil); err == nil {
		t.Fatal("missing args should fail")
	}
	if err := validateScanArgs([]string{"-sV", "203.0.113.10;id"}); err == nil {
		t.Fatal("shell metacharacter should fail")
	}
	if err := validateScanArgs([]string{""}); err == nil {
		t.Fatal("empty arg should fail")
	}
	if err := validateScanArgs([]string{strings.Repeat("a", 513)}); err == nil {
		t.Fatal("long arg should fail")
	}
}

func TestCircuitOpensAfterRepeatedFailures(t *testing.T) {
	j := &ScanJobs{fails: map[string]int{}, openUntil: map[string]time.Time{}}
	now := time.Now()
	for i := 0; i < scanJobFailLimit-1; i++ {
		j.noteResult("t", "nmap", false, now)
		if j.circuitOpen("t", "nmap", now) {
			t.Fatal("opened too early")
		}
	}
	j.noteResult("t", "nmap", false, now)
	if !j.circuitOpen("t", "nmap", now.Add(time.Minute)) {
		t.Fatal("expected open circuit")
	}
	j.noteResult("t", "nuclei", true, now)
	if j.circuitOpen("t", "nuclei", now) {
		t.Fatal("a success on another tool should not open it")
	}
}
