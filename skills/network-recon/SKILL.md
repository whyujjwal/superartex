---
name: network-recon
description: "Invoke when an authorized task needs host or service discovery with nmap, rustscan, masscan, or arp-scan. Prefer start_scan_job for long sweeps. Disabled until an operator grants this skill."
---

# Network recon

Use only against hosts, ranges, and ports named in the task scope. A program that bans scanners, or caps rate, means you do not run masscan or a full-port nmap.

## Tools

| Binary | Use |
|---|---|
| nmap | Service and version detection on a named host or a small range |
| rustscan | Fast port discovery, then hand open ports to nmap |
| masscan | Large ranges only when the rules of engagement allow a high rate |
| arp-scan | Local L2 discovery on a lab segment you are attached to |

## How to run

Long scans go through `start_scan_job` with `tool` set to the binary and `args` as an argv list. Put the target IP, CIDR, or host in `args` so the target gate can see it. Then `get_scan_job` or `wait_scan_job`. Cancel with `cancel_scan_job` if the scope changes.

Short checks may use Bash. Do not wrap the scanner in a shell pipeline that hides the target.

Examples of argv, not shell strings:

- nmap: `-sV`, `-p`, `22,80,443`, `203.0.113.10`
- rustscan: `-a`, `203.0.113.10`, `--`, `-sV`
- masscan: `203.0.113.0/24`, `-p`, `80,443`, `--rate`, `100`
- arp-scan: `--localnet`

Record open ports back onto the asset. Do not exploit a service from this skill.

## Order of work

1. Read the task scope and any rate limit before the first packet.
2. Confirm the binary exists (`nmap -V` or the equivalent). If it is missing, record that and stop. Do not install tools at runtime.
3. Discover ports on one host or a small range.
4. Run version detection only on ports that answered.
5. Write each open service back as an asset with the job id.

## Rates

| Tool | Default ceiling |
|---|---|
| nmap | One host, or a /28, unless the program names a larger range |
| rustscan | `--ulimit 500` and then nmap on the open ports only |
| masscan | `--rate 100` unless the program sets a different number |
| arp-scan | The local lab segment only |

## Evidence

Keep the job id, the argv, and the open-port lines. A filtered or timed-out scan is a fact, not an empty host. Say which ports were not completed.

## Stop

Stop when the scope list is exhausted, the program bans scanners, or the same argv already returned from cache. Do not re-run a cached success.
