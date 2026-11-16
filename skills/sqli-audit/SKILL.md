---
name: sqli-audit
description: "Invoke for authorized SQL injection testing of one in-scope URL or parameter with sqlmap: detect the injection, prove the level of access, and record evidence. Disabled until an operator grants this skill."
---

# SQL injection testing

Test only a URL and parameter the task scope already names. sqlmap is an active test that sends many requests to a live service: the program's rules on injection testing and rates come first.

## Order of work

1. Confirm the target URL and parameter are in scope and the program allows active injection testing. A scanner ban stops this skill.
2. Start with detection only, low and slow: `--batch --level 1 --risk 1` on one parameter.
3. If an injection is found, prove what it can reach with the minimal standard checks: `--current-user --current-db --is-dba` and `--banner`. That is the finding.
4. Record the DBMS, the parameter, and the payload. Attach the sqlmap log under the task directory.
5. Stop at proof of access. Enumeration beyond that is a separate operator decision.

## Rates and scope

- One target, one parameter per run. `--threads 3` unless the program sets a lower number.
- Do not crawl or auto-spider (`--crawl`, `--forms`): test the parameter you already found.
- No `--tamper` evasion chains unless the program explicitly allows WAF bypass testing.

## Prohibitions

- No `--os-shell`, `--sql-shell`, `--file-read`, or `--file-write`: those are webshell and file-write paths, out of bounds for this skill.
- No bulk extraction of user data. `--dump` is allowed only when the rules of engagement explicitly require data-access proof, and then a limited sample, never personal data tables.
- No writing to the database (`--sql-query` with INSERT/UPDATE/DELETE) even to "clean up". A destructive test stays destructive.

## Evidence

The finding quotes sqlmap's detection line (parameter, technique, DBMS), the access proof, and the request that carried the payload when the recording proxy captured it. A run that found no injection is also a fact: record the parameter tested and the level/risk used.
