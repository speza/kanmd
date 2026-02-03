---
name: kanban
description: Manage project tasks using a markdown-backed Kanban board. Use when tracking work items, creating tasks, moving cards between columns, or viewing project status.
argument-hint: "[command] [args...]"
---

# Kanban Task Management

You have access to `kanmd`, a markdown-backed Kanban CLI. Use it to track tasks in the current project.

## Quick Reference

| Command | Description |
|---------|-------------|
| `kanmd` | Display the board with all tasks |
| `kanmd add <column> <title>` | Create a new task |
| `kanmd show <card-id>` | View task details |
| `kanmd move <card-id> <column>` | Move task to another column |
| `kanmd edit <card-id> [options]` | Update task properties |
| `kanmd priority <card-id> <level>` | Set priority (high/medium/low) |
| `kanmd depends <card-id>` | Show task dependencies |
| `kanmd depends <card-id> add <dep-id>` | Add a dependency |
| `kanmd depends <card-id> rm <dep-id>` | Remove a dependency |
| `kanmd delete <card-id>` | Remove a task |
| `kanmd help` | Show CLI help and examples |

## Handling Arguments

If arguments are provided (`$ARGUMENTS`), interpret them as a kanmd operation:
- `/kanban` → show the board
- `/kanban add todo Fix login bug` → create a task
- `/kanban move fix-login-bug done` → move card to done
- `/kanban depends my-task add setup-db` → add a dependency

## First-Time Setup

If no `.kanban/` directory exists, initialize one:

```bash
mkdir -p .kanban/{backlog,todo,in-progress,review,done}
cat > .kanban/board.yaml << 'EOF'
columns:
  - backlog
  - todo
  - in-progress
  - review
  - done
EOF
```

## When to Use

- **User asks to track work**: Create cards for multi-step tasks
- **Starting complex work**: Break it into cards, move them as you progress
- **Session handoff**: Leave incomplete work as cards for the next session
- **User asks about status**: Show the board

## Card Format

Cards are markdown files with YAML frontmatter in `.kanban/<column>/<id>.md`:

```markdown
---
priority: high
labels: bug, auth
dependencies: setup-database, create-user-model
created: 2024-01-15
---

# Fix login timeout

## Description
Users are getting logged out after 5 minutes...

## Checklist
- [x] Identify the cause
- [ ] Update session config
- [ ] Add tests
```

Dependencies are shown with status indicators:
- **Green**: dependency is done
- **Yellow**: dependency is in another column (blocks this task)
- **Red**: dependency card not found

Tasks with unresolved dependencies show `[blocked]` in the board view.

## Best Practices

1. **Keep titles concise** - Use description for details
2. **Use priority wisely** - High = blocking, Medium = normal, Low = nice-to-have
3. **Move cards promptly** - Update status as work progresses
4. **Use checklists** - Break complex cards into subtasks
5. **Use dependencies** - Link tasks that must complete before others can start

## Example Workflow

```bash
# Check current state
kanmd

# Add tasks
kanmd add todo "Setup database"
kanmd add todo "Implement user authentication"

# Add a dependency (auth depends on database)
kanmd depends implement-user-authentication add setup-database

# Start working on it
kanmd move setup-database in-progress

# Update priority
kanmd priority setup-database high

# Mark complete (unblocks dependent tasks)
kanmd move setup-database done
```
