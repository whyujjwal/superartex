---
name: forensics-ctf
description: "Invoke for authorized file, image, and memory inspection with binwalk, exiftool, steghide, zsteg, or volatility3. Read-only. Disabled until an operator grants this skill."
---

# Forensics utilities

Inspect files the operator placed in the task workspace, or memory images from a system they own. Do not write into the evidence except for extracted copies under the task directory.

## Tools

| Binary | Use |
|---|---|
| exiftool | Metadata on a file |
| binwalk | Embedded files inside a firmware or capture image |
| steghide / zsteg | Steganography checks on a file you were given |
| volatility3 | Read-only memory image analysis |

## How to run

- exiftool: `evidence.jpg`
- binwalk: `-e`, `firmware.bin`
- volatility3: `-f`, `memory.raw`, `windows.info`

Quote the exact output that supports a fact. Do not treat a file puzzle as a reason to attack a live host.

## Order of work

1. Work only on files in the task workspace or on an image the operator attached.
2. exiftool first, then binwalk if the file type suggests embedded content.
3. steghide and zsteg only on the file you were given. Do not hunt for a passphrase by attacking a live service.
4. volatility3 only on a memory image path the task names. Start with the info plugin. Add one plugin at a time and quote its output.
5. Copy extracted files under the task directory. Do not overwrite the original.

## Evidence

The fact quotes the tool line and the file path. A missing plugin or profile is a gap, not a guess.
