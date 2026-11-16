---
name: osint-recon
description: "Invoke for authorized subdomain and name discovery with subfinder, amass, theHarvester, or sherlock. Disabled until an operator grants this skill."
---

# OSINT recon

Query public sources about names that are in scope. Do not probe a name the program excluded. A result is not in scope until it matches the task's scope rules.

## Tools

| Binary | Use |
|---|---|
| subfinder | Passive subdomain enumeration |
| amass | Broader passive collection when subfinder is not enough |
| theHarvester | Emails and hosts from public sources for one domain |
| sherlock | Username checks only when the engagement includes a named account and the program allows it |

## How to run

Passive commands can use Bash or `start_scan_job`.

- subfinder: `-d`, `example.com`, `-silent`
- amass: `enum`, `-passive`, `-d`, `example.com`
- theHarvester: `-d`, `example.com`, `-b`, `crtsh,duckduckgo`

Insert new names as assets with the source. Do not scan a newly found host until it is inside scope.

## Order of work

1. subfinder on each in-scope root domain.
2. amass passive only if subfinder returned nothing useful or the program asked for a second source.
3. theHarvester for the same domain when the program wants public emails or hosts.
4. sherlock only for a username the operator put in the task. Do not invent usernames.
5. Diff the names against scope. Out-of-scope names go in the notes as intel, not as scan targets.

## Evidence

Record the source binary, the job id, and the new names. A cached run still counts. Do not treat a third-party dataset as proof that a host is in scope.
