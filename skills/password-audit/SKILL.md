---
name: password-audit
description: "Invoke for authorized password auditing: offline cracking of hashes the task already holds with hashcat or john, and online testing of in-scope services with hydra. Disabled until an operator grants this skill."
---

# Password auditing

Audit only hashes and services the task scope names. Online guessing touches a live service: the program's lockout policy, rate rules, and the damage a lockout does to a real user come before any run.

## Tools

| Binary | Use |
|---|---|
| hashcat | Offline cracking of a hash file the task already holds |
| john | Offline cracking where a hash format suits it better than hashcat |
| hydra | Online testing of one named in-scope service, never a spray across many hosts |

## Order of work

1. Confirm the hash file or the service is in scope. A hash set with no provenance is not in scope.
2. Offline first. hashcat with the right attack mode (`-m` for the type, `-a 0` wordlist, `-a 3` mask) beats any online guessing.
3. Identify the hash type before running. Cracking with the wrong `-m` wastes the run; `hashcat --show` recovers found plaintexts from a prior session.
4. Online only when the program allows it and offline work is done. One service, one small wordlist, one rate.
5. Record recovered plaintexts as task credentials through the existing credential tool, not in free text.

## Rates

hydra `-t 4` (four tasks) unless the program sets a different number. Stop immediately when answers slow down or lockout messages appear. Never run hydra against a list of hosts.

## Prohibitions

- No credential reuse: a recovered password is tested only against the scope it was recovered from.
- No guessing at personal passwords, no wordlists built from the target's public data without the program allowing it.
- No online attack on a service that the program lists as fragile or shared.

## Evidence

The audit reports the hash type, the attack mode, the wordlist name, and the recovered count. Quote the hashcat `--show` line or the john output. A run that cracked nothing is a fact worth recording with the duration.
