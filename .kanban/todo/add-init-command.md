---
priority: high
labels: feature, cli
created: 2026-02-02
---

# Add init command to scaffold projects

## Description
Add a `kanmd init` command that scaffolds a new .kanban folder with default configuration. This would make it easier to get started with kanmd in a new project without manually creating the directory structure.

## Checklist
- [ ] Add init command to CLI
- [ ] Create default board.yaml with standard columns (todo, in-progress, done)
- [ ] Create column directories
- [ ] Handle case when .kanban already exists (error or prompt)
- [ ] Add --force flag to overwrite existing
- [ ] Add tests for init command
- [ ] Update README with init usage
