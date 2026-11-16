package server

import (
	"log"
)

// ctfDefaultPrompt drives the seeded CTF solver agent: classify the challenge,
// pick the matching skill, attempt, verify, iterate — against the challenge
// files in the task workspace or deliberately vulnerable lab targets only.
const ctfDefaultPrompt = `You solve CTF and lab challenges the operator attached to the task workspace or explicitly named as deliberately vulnerable targets.

Loop:
1. CLASSIFY: read the challenge files and the description. Pick the category: web, binary/pwn, crypto, forensics/stego, reversing, or misc. If two categories overlap, start with the one the files suggest.
2. PICK THE SKILL: web → sqli-audit, web-fuzzing, vuln-scan; binary/pwn → exploit-dev; forensics/stego → forensics-ctf; crypto/password → password-audit (offline only). Run only the granted skill's playbook.
3. ATTEMPT: work step by step and quote real tool output for every claim. Long scans go through start_scan_job (or a typed wrapper) so they are recorded and cancellable.
4. VERIFY: a flag or a proof of control counts only when quoted from actual output you produced. Never invent a flag or extend output.
5. ITERATE: if an approach dead-ends twice, record what failed and switch approach. After three dead ends, report the obstacle and what you would try next instead of guessing.

Boundaries:
- Challenge files in the task workspace and explicitly named lab targets only. Never point tooling at third-party production systems; if the target looks like one, stop and ask.
- Every destructive or state-changing step goes through the normal approval queue. Nothing here has a shortcut.
- Record intermediate results as facts as you go, so a failed attempt is still evidence.`

// seedCTFAgent creates the built-in "ctf" agent once: solver prompt, typed
// scan tool bindings, and visibility on the lab/audit skills.
func (s *Server) seedCTFAgent() {
	const flag = "ctf_agent_seed_v1"
	if v, _, _ := s.m.pg.GetSetting(flag); v == "true" {
		return
	}
	defer func() { _ = s.m.pg.SetSetting(flag, "true") }()

	if exist, _ := s.m.pg.GetAgentByKey("ctf"); exist != nil {
		return
	}
	a, err := s.m.pg.CreateAgent("ctf", "CTF solver",
		"Solves CTF and lab challenges attached to the task: classifies the category, applies the matching skill playbook, iterates with evidence until a flag or a clear blocked statement.")
	if err != nil {
		log.Printf("[ctf] failed to create agent: %v", err)
		return
	}
	if err := s.m.pg.SeedPromptIfEmpty(a.ID, ctfDefaultPrompt); err != nil {
		log.Printf("[ctf] seed prompt failed: %v", err)
	}
	binds := []string{"start_scan_job", "get_scan_job", "wait_scan_job", "cancel_scan_job",
		"report_finding", "record_fact", "set_goals", "prove_goal"}
	for _, spec := range typedScanSpecs {
		binds = append(binds, spec.key)
	}
	if err := s.m.pg.AddAgentToToolBinding("ctf", binds); err != nil {
		log.Printf("[ctf] failed to bind tools: %v", err)
	}
	for _, skill := range []string{"exploit-dev", "forensics-ctf", "sqli-audit", "password-audit", "web-fuzzing", "vuln-scan", "network-recon"} {
		if err := s.m.pg.ToggleSkillVisibility(a.ID, skill, true); err != nil {
			log.Printf("[ctf] skill bind %s failed: %v", skill, err)
		}
	}
	log.Printf("[ctf] seeded the CTF solver agent")
}
