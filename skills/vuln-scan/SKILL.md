---
name: vuln-scan
description: "Invoke when an authorized task allows active vulnerability scanning with nuclei, nikto, wpscan, wafw00f, or dalfox. Disabled until an operator grants this skill."
---

# Vulnerability scanning

Run only where the program allows automated scanning. A scanner ban means this skill stops after recording that fact.

## Tools

| Binary | Use |
|---|---|
| nuclei | Template scan of a URL or host list already in scope |
| nikto | One web server, after the program allows it |
| wpscan | WordPress sites the program owns or lists |
| wafw00f | Identify a WAF before choosing a scan rate |
| dalfox | XSS parameter checks on a URL you already found |

## How to run

Use `start_scan_job` for nuclei and nikto. Keep the target URL in `args`.

- nuclei: `-u`, `https://app.example.com`, `-severity`, `medium,high,critical`
- wafw00f: `https://app.example.com`
- wpscan: `--url`, `https://blog.example.com`, `--enumerate`, `vp,vt`

Treat scanner output as a lead. Confirm it before you file a finding, and attach the request the scanner actually sent when the product captured it.

## Order of work

1. Identify the WAF with wafw00f. If one is present, lower the nuclei rate or stop.
2. Run nuclei with a severity filter. Do not load every template in the catalog on the first pass.
3. Use nikto or wpscan only on the one host the program named.
4. Use dalfox on a URL you already discovered, with the parameter you already saw. Do not crawl the whole site from dalfox.
5. Every hit stays a lead until you can quote a response that shows the issue.

## Rates

nuclei `-rl 10 -c 5` unless the program allows more. One host at a time when a WAF was detected.

## Evidence

The finding needs the template id or the nikto line, the URL, and the job id. A scanner timeout is not a vulnerability.
