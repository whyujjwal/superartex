---
name: cloud-audit
description: "Invoke for an authorized read-only cloud, container, or Kubernetes posture review with prowler, scout, trivy, kube-hunter, or kube-bench. Disabled until an operator grants this skill."
---

# Cloud and container posture

Use credentials the operator stored for this task. Do not create, delete, or modify cloud resources. If a tool offers an active or exploit mode, do not enable it.

## Tools

| Binary | Use |
|---|---|
| prowler | AWS, Azure, or GCP configuration checks |
| scout | Multi-cloud configuration report (Scout Suite) |
| trivy | Image, filesystem, or Kubernetes misconfiguration and CVE scan |
| kube-bench | CIS benchmark on a cluster you are allowed to read |
| kube-hunter | Passive cluster review unless the program explicitly allows active checks |

## How to run

- trivy: `image`, `example.com/app:1.2.3` or `fs`, `.`
- kube-bench: `run`, `--benchmark`, `cis-1.8`
- prowler: `aws`, `--service`, `s3`, `iam`

Record each failed check with the control id and the resource name. A missing credential is a gap to report, not a reason to guess one.

## Order of work

1. Confirm which account, subscription, project, image, or cluster the task names.
2. Use the credential already stored for that target. Do not copy a key into the argv.
3. trivy on the named image or path first. It needs no cloud write access.
4. prowler or scout on one provider at a time, one service family at a time when the full run would be too large.
5. kube-bench for the CIS view. kube-hunter stays passive unless the program says active checks are allowed.

## Evidence

Each failed control needs its id, the resource, and the job id. A tool that cannot authenticate is a gap, reported once, not retried with guessed credentials.

## Stop

Stop before any command that creates, deletes, or modifies a cloud resource. This skill is a review.
