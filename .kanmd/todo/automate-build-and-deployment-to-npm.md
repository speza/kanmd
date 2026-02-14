---
priority: medium
labels:
created: 2026-02-05T15:34:29.591Z
updated: 2026-02-05T15:34:33.134Z
---

# Automate build and deployment to npm

## Description
Set up CI/CD pipeline to automate the release process:

- Configure GitHub Actions workflow for automated builds
- Run tests and linting on PR/push
- Automate npm publish on version tag or release
- Add version bumping script or use semantic-release
- Ensure package.json and dist are in sync before publish
