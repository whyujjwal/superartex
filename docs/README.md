[SuperArtex](../README.md) / Documentation

# The SuperArtex handbook

**From your first launch to the evidence behind a finding.**

Run SuperArtex on your own infrastructure and review the recorded decisions, captured traffic, and findings in the workspace.

## Start here

1. **[Install and claim your instance](getting-started.md).** Start the Docker stack and complete account setup. Includes native build instructions.
2. **[Review existing results](usage.md).** Inspect recorded decisions, evidence, findings, and exports.
3. **[Configure your environment](configuration.md).** Understand database precedence, local listeners, runtime files, and key storage.

> [!IMPORTANT]
> Use only authorized targets. Task scope is advisory, and the approval gate covers a specific tool set. Read the [security model](security-model.md) before starting a task.

## Find your next step

### Use the workspace

- [Review approvals, inspect findings, and export reports](usage.md).
- [Browse platform capabilities](toolkit.md).

### Run your instance

- [Database settings and deployment configuration](configuration.md).
- [Backups, restore, updates, and reverse proxy deployment](operations.md).
- [Troubleshooting](operations.md#troubleshooting).
- [Development and demo mode](operations.md#development).

### Understand the system

- [Architecture](architecture.md) — source layout, dual graphs, and the event-driven planner/worker loop.
- [Security model](security-model.md) — approval rules, execution paths, target controls, and storage boundaries.
- [Traffic evidence internals](vulnerability-traffic-evidence.md) — bindings, evidence versions, exports, and archiving.
- [Security policy](../SECURITY.md) — private vulnerability reporting.
- [Changelog](../CHANGELOG.md) — project history.

---

[Back to the project →](../README.md)
