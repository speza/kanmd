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
| `kanmd delete <card-id>` | Remove a task |
| `kanmd rank <card-id> <pos>` | Set position within priority group |
| `kanmd help` | Show CLI help and examples |

## Handling Arguments

If arguments are provided (`$ARGUMENTS`), interpret them as a kanmd operation:
- `/kanban` → show the board
- `/kanban add todo Fix login bug` → create a task
- `/kanban move 3 done` → move card 3 to done

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

## Configuration

Set `KANMD_DIR` to use a custom board location:

```bash
KANMD_DIR="/path/to/board" kanmd
```

Defaults to `.kanban/` in the current directory.

## Card Format

Cards are markdown files with YAML frontmatter in `.kanban/<column>/<id>.md`:

```markdown
---
priority: high
labels: bug, auth
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

## Best Practices

1. **Keep titles concise** - Use description for details
2. **Use priority wisely** - High = blocking, Medium = normal, Low = nice-to-have
3. **Move cards promptly** - Update status as work progresses
4. **Use checklists** - Break complex cards into subtasks

## Example Workflow

```bash
# Check current state
kanmd

# Add a task
kanmd add todo "Implement user authentication"

# Start working on it
kanmd move implement-user-authentication in-progress

# Update priority
kanmd priority implement-user-authentication high

# Reorder within priority group (move to position 1)
kanmd rank implement-user-authentication 1

# Mark complete
kanmd move implement-user-authentication done
```
