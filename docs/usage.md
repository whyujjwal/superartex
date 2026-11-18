# Review and export results

[Documentation](README.md) · [Getting started](getting-started.md) · [Configuration](configuration.md) · [Operations](operations.md)

Review recorded decisions, captured evidence, and existing findings in the workspace.

## Review approval records

Open the task's **Interception approval** tab for its records, or **System → Approval Records** for the global view. Expand an existing record to see its decision, actor, and linked execution result when available.

## Review findings and their evidence

Open the task's **Findings** tab, or **Functions → Findings** (`/function/findings`) for the cross-task view. Open a finding to inspect:

- **Digest**, **Evidence / PoC**, counterevidence, and confidence rationale when available.
- **Linked traffic** and **View message** for the captured request/response snapshots.
- **Detailed report** for reproduction and remediation details.
- **Status**, severity, and **Verification** in the status panel.
- **Exploration graph** for the finding's lineage.

Finding status and verification are separate. A high severity or a manually confirmed status does not establish that captured evidence proves the claim. Read the verification note when a finding is unverified or not assessed.

The automated receipt check uses linked responses and stored evidence to assess the finding.

## Copy a report or export findings

The task's **Report** tab renders a **Penetration test report (Markdown)** from the task's current data. Choose **Copy** to copy the Markdown and save it to a `.md` file. Reopen the tab to load the latest report after further task activity.

For downloadable findings, open **Functions → Findings** and choose **Export**. Select the current filter results, all findings, or checked rows, then choose:

- A single Markdown summary report.
- One Markdown file per finding, packaged as a ZIP.
- CSV.
- JSON.

Review evidence, verification notes, and testing limitations before sharing an assessment. See [Operations](operations.md) for retaining, archiving, and backing up the task's records.
