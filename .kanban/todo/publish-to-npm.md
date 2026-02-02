---
priority: medium
labels: release, infra
created: 2026-02-02
---

# Publish to npm

## Description
Publish kanmd as a public npm package so users can install it globally with `npm install -g kanmd`.

## Checklist
- [ ] Verify package.json has correct name, version, description
- [ ] Add bin field pointing to CLI entry point
- [ ] Ensure dist/ is built and included in package
- [ ] Add .npmignore or files field to exclude dev files
- [ ] Create npm account if needed
- [ ] Run npm publish
- [ ] Test global install works: npm install -g kanmd
- [ ] Add install instructions to README
