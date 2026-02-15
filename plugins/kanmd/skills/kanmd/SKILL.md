---
name: kanmd
description: Manage project tasks using a markdown-backed Kanban board. Use when tracking work items, creating tasks, moving cards between columns, or viewing project status.
argument-hint: "[command] [args...]"
---

# Kanban Task Management

You have access to `kanmd`, a markdown-backed Kanban CLI. Use it to track tasks in the current project.

## Quick Reference

| Command | Description |
|---------|-------------|
| `kanmd` | Display the board |
| `kanmd add <column> <title>` | Create a new task |
| `kanmd show <card-id>` | View task details |
| `kanmd move <card-id> <column>` | Move task to another column |
| `kanmd edit <card-id> [options]` | Update task properties |
| `kanmd priority <card-id> <level>` | Set priority (high/medium/low) |
| `kanmd delete <card-id>` | Remove a task |
| `kanmd rank <card-id> <pos>` | Set position within priority group |
| `kanmd checklist add <id> <text>` | Add a checklist item |
| `kanmd checklist toggle <id> <index>` | Toggle checklist item checked/unchecked |
| `kanmd checklist remove <id> <index>` | Remove a checklist item |
| `kanmd help` | Show CLI help and examples |

Append `--json` to any command for structured, machine-readable output.

## Checklist Management

Manage subtasks on cards with dedicated checklist commands:

```bash
# Add checklist items
kanmd checklist add my-task "Write unit tests"
kanmd checklist add my-task "Update docs"

# Toggle item checked/unchecked (1-indexed)
kanmd checklist toggle my-task 1

# Remove an item (1-indexed)
kanmd checklist remove my-task 2
```

## JSON Output

Append `--json` to any command for structured output:

```bash
kanmd --json
# {"columns":["todo","in-progress","done"],"cards":{"todo":[{"id":"my-task","title":"My Task",...}],...}}

kanmd show my-task --json
# {"id":"my-task","title":"My Task","column":"todo","priority":"medium",...}

kanmd add todo "Fix auth" --json
# {"id":"fix-auth","title":"Fix auth","column":"todo","priority":"medium","created":"2024-01-15T10:30:00.000Z",...}

# Errors are also JSON when using --json
kanmd show nonexistent --json
# {"error":"Card \"nonexistent\" not found","code":"CARD_NOT_FOUND"}
```

## Handling Arguments

If arguments are provided (`$ARGUMENTS`), interpret them as a kanmd operation:
- `/kanmd` → show the board
- `/kanmd add todo Fix login bug` → create a task
- `/kanmd move 3 done` → move card 3 to done

## First-Time Setup

If no `.kanmd/` directory exists, initialize one:

```bash
mkdir -p .kanmd/{backlog,todo,in-progress,review,done}
cat > .kanmd/board.yaml << 'EOF'
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
- **Tracking subtasks**: Use checklists to break cards into steps

## Configuration

Set `KANMD_DIR` to use a custom board location:

```bash
KANMD_DIR="/path/to/board" kanmd
```

Defaults to `.kanmd/` in the current directory.

## Card Format

Cards are markdown files with YAML frontmatter in `.kanmd/<column>/<id>.md`:

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
4. **Use checklists** - Break complex cards into subtasks and toggle them as you go
5. **Use `--json` when parsing output** - For structured data instead of formatted text

## Example Workflow

```bash
# Check current state
kanmd

# Add a task
kanmd add todo "Implement user authentication"

# Add subtasks
kanmd checklist add implement-user-authentication "Design auth flow"
kanmd checklist add implement-user-authentication "Implement OAuth"
kanmd checklist add implement-user-authentication "Add session management"

# Start working on it
kanmd move implement-user-authentication in-progress

# Mark subtasks complete
kanmd checklist toggle implement-user-authentication 1

# Update priority
kanmd priority implement-user-authentication high

# Reorder within priority group (move to position 1)
kanmd rank implement-user-authentication 1

# Mark complete
kanmd move implement-user-authentication done
```
