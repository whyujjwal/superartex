package server

import (
	"strings"
	"testing"
)

func TestTypedScanSpecsAreAllowlisted(t *testing.T) {
	seen := map[string]bool{}
	for _, spec := range typedScanSpecs {
		if _, ok := scanAllowlist[spec.bin]; !ok {
			t.Fatalf("spec %s references non-allowlisted binary %q", spec.key, spec.bin)
		}
		if seen[spec.key] {
			t.Fatalf("duplicate wrapper key %q", spec.key)
		}
		seen[spec.key] = true
	}
	for _, banned := range []string{"sqlmap", "hashcat", "john", "hydra"} {
		for _, spec := range typedScanSpecs {
			if spec.bin == banned {
				t.Fatalf("interactive attack tool %q must not get a typed wrapper", banned)
			}
		}
	}
}

func TestTypedScanArgMapping(t *testing.T) {
	spec, ok := scanSpecByKey("nmap_scan")
	if !ok {
		t.Fatal("nmap_scan spec missing")
	}
	got := spec.args(map[string]any{
		"target": "203.0.113.10", "ports": "22,443", "service_version": true,
	})
	want := []string{"-sV", "-p", "22,443", "203.0.113.10"}
	if strings.Join(got, " ") != strings.Join(want, " ") {
		t.Fatalf("nmap args = %v, want %v", got, want)
	}

	spec, _ = scanSpecByKey("masscan_ports")
	got = spec.args(map[string]any{"target": "203.0.113.0/24", "ports": "80,443", "rate": 50})
	want = []string{"203.0.113.0/24", "-p", "80,443", "--rate", "50"}
	if strings.Join(got, " ") != strings.Join(want, " ") {
		t.Fatalf("masscan args = %v, want %v", got, want)
	}
}
