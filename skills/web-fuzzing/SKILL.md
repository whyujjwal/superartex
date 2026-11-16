---
name: web-fuzzing
description: "Invoke when an authorized task needs content or endpoint discovery with gobuster, ffuf, feroxbuster, dirsearch, or httpx. Disabled until an operator grants this skill."
---

# Web content discovery

Stay on URLs and hosts inside the task scope. Respect rate limits. Skip logout, password-reset, and payment endpoints unless the program lists them as in scope.

## Tools

| Binary | Use |
|---|---|
| httpx | Probe which hosts answer HTTP and which titles or status codes they return |
| gobuster / feroxbuster / dirsearch | Directory and file discovery against one base URL |
| ffuf | Parameter or path fuzzing when you need a filter on status or size |

## How to run

Prefer `start_scan_job` for wordlist runs. Pass the base URL in `args`.

- httpx: `-u`, `https://app.example.com`, `-title`, `-sc`
- ffuf: `-u`, `https://app.example.com/FUZZ`, `-w`, `/usr/share/seclists/Discovery/Web-Content/common.txt`, `-mc`, `200,204,301,302,307,401,403`

Write discovered paths back as endpoints. This skill does not submit exploit payloads.

## Order of work

1. Probe live URLs with httpx before any wordlist.
2. Pick one wordlist. `common.txt` is the default. A bigger list needs the program to allow the extra requests.
3. One base URL per job. Do not fan out across every subdomain in a single ffuf call.
4. Treat 401 and 403 as paths that exist. Treat 404 and the connection error as noise.
5. Record the path, status, and length. Do not send a payload to a new path from this skill.

## Rates

Cap threads. ffuf `-t 10`, feroxbuster `--rate-limit 10`, gobuster `-t 10`, unless the program sets another number. Stop a job that starts returning only errors.

## Evidence

Save the job id and the lines that were not the baseline status. A cached job is still evidence: cite `cached_from` instead of running it again.
