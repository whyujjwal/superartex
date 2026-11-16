package db

import "errors"

// engagementPresets are the built-in task templates, seeded one by one and
// guarded per template: a preset a user deletes is never re-seeded on restart,
// and a preset added in a later release still seeds into an older database.
var engagementPresets = []TaskTemplateInput{
	{
		Name:        "Bug Bounty Recon",
		Description: "Authorized bounty recon. Start from the program scope, stay inside it, and stop at evidence the operator can triage. Grant network-recon, web-fuzzing, vuln-scan, and osint-recon before the agent runs them.",
		Goal:        "Enumerate in-scope names, find live hosts, run a vulnerability scan only where the program allows active scanning, and write each result back with the command and the asset it touched. Do not exploit.",
	},
	{
		Name:        "Network Penetration Test",
		Description: "Authorized network test. Discovery and service enumeration first. Exploitation only when the rules of engagement say so, and only through the normal approval path.",
		Goal:        "Discover in-scope hosts and services, enumerate what is actually exposed, and record evidence for each service. Hand any exploit step to the operator through the existing approval queue.",
	},
	{
		Name:        "Cloud Security Audit",
		Description: "Posture review of cloud, container, and Kubernetes configuration the operator has credentials for. Grant cloud-audit. Read-only checks only.",
		Goal:        "Review the declared cloud accounts, container images, and clusters for misconfiguration. Record each finding with the check that produced it. Do not change cloud state.",
	},
	{
		Name:        "API Security Assessment",
		Description: "Builds on the api-recon and api-security skills. Map the API, then test only the endpoints inside the task scope.",
		Goal:        "Collect the in-scope API surface, then assess authentication, authorization, and input handling on those endpoints. Bind evidence to the request and response.",
	},
	{
		Name:        "CTF Binary Challenge",
		Description: "Lab exploit development on the challenge binary the operator attached. Grant exploit-dev. The exploit stays in the lab.",
		Goal:        "Reverse the challenge binary, identify the vulnerability class, build a proof-of-concept exploit against the local copy, and record the crash, the chain, and the final payload. Do not point the exploit at any live third-party system.",
	},
	{
		Name:        "AD Security Audit",
		Description: "Read-only Active Directory posture review the operator has credentials and permission for: enumeration and misconfiguration analysis only. Grant password-audit only if the program allows offline cracking. Lateral movement and credential-theft tooling are not part of this template.",
		Goal:        "Enumerate the named domain's users, groups, trusts, and access-control misconfigurations from the data the operator authorized, map the paths that would allow privilege escalation, and record each misconfiguration with the query that found it. Do not use captured credentials against live systems; route any live-directory interaction through the operator's approval.",
	},
}

// seedEngagementTemplates inserts each built-in preset once, guarded by a
// per-template settings flag. CreateTaskTemplate does not overwrite on name
// conflict, and a later delete is respected because its flag stays set.
func (d *DB) seedEngagementTemplates() error {
	for _, in := range engagementPresets {
		flag := "engagement_template_v1:" + in.Name
		if v, _, _ := d.GetSetting(flag); v == "done" {
			continue
		}
		if _, err := d.CreateTaskTemplate(in); err != nil && !errors.Is(err, ErrTaskTemplateNameConflict) {
			return err
		}
		if err := d.SetSetting(flag, "done"); err != nil {
			return err
		}
	}
	return nil
}
