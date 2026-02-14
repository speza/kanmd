---
name: kanmd
description: Manage project tasks using a markdown-backed Kanban board. Use when tracking work items, creating tasks, moving cards between columns, or viewing project status.
argument-hint: "[command] [args...]"
---

# Kanban Task Management

You have access to `kanmd`, a markdown-backed Kanban CLI. Use it to track tasks in the current project.

**Always use `--json` for machine-readable output.** This returns structured JSON instead of formatted text, making it reliable for parsing card data, board state, and operation results.

## Quick Reference

| Command | Description |
|---------|-------------|
| `kanmd --json` | Display the board as structured JSON |
| `kanmd add <column> <title> --json` | Create a new task |
| `kanmd show <card-id> --json` | View task details |
| `kanmd move <card-id> <column> --json` | Move task to another column |
| `kanmd edit <card-id> [options] --json` | Update task properties |
| `kanmd priority <card-id> <level> --json` | Set priority (high/medium/low) |
| `kanmd delete <card-id> --json` | Remove a task |
| `kanmd rank <card-id> <pos> --json` | Set position within priority group |
| `kanmd checklist add <id> <text> --json` | Add a checklist item |
| `kanmd checklist toggle <id> <index> --json` | Toggle checklist item checked/unchecked |
| `kanmd checklist remove <id> <index> --json` | Remove a checklist item |
| `kanmd help` | Show CLI help and examples |

## JSON Output

Append `--json` to any command for structured output. All commands support it:

```bash
# Board state as JSON
kanmd --json
# {"columns":["todo","in-progress","done"],"cards":{"todo":[{"id":"my-task","title":"My Task",...}],...}}

# Card details as JSON
kanmd show my-task --json
# {"id":"my-task","title":"My Task","column":"todo","priority":"medium",...}

# Create returns the new card
kanmd add todo "Fix auth" --json
# {"id":"fix-auth","title":"Fix auth","column":"todo","priority":"medium","created":"2024-01-15T10:30:00.000Z",...}

# Errors are also JSON
kanmd show nonexistent --json
# {"error":"Card \"nonexistent\" not found","code":"CARD_NOT_FOUND"}
```

## Checklist Management

Manage subtasks on cards with dedicated checklist commands:

```bash
# Add checklist items
kanmd checklist add my-task "Write unit tests" --json
kanmd checklist add my-task "Update docs" --json

# Toggle item checked/unchecked (1-indexed)
kanmd checklist toggle my-task 1 --json

# Remove an item (1-indexed)
kanmd checklist remove my-task 2 --json
```

All checklist commands return the full updated card as JSON.

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

1. **Always use `--json`** - Parse structured data instead of formatted text
2. **Keep titles concise** - Use description for details
3. **Use priority wisely** - High = blocking, Medium = normal, Low = nice-to-have
4. **Move cards promptly** - Update status as work progresses
5. **Use checklists** - Break complex cards into subtasks and toggle them as you go
6. **Check error codes** - JSON errors include a `code` field for programmatic handling

## Example Workflow

```bash
# Check current state
kanmd --json

# Add a task
kanmd add todo "Implement user authentication" --json

# Add subtasks
kanmd checklist add implement-user-authentication "Design auth flow" --json
kanmd checklist add implement-user-authentication "Implement OAuth" --json
kanmd checklist add implement-user-authentication "Add session management" --json

# Start working on it
kanmd move implement-user-authentication in-progress --json

# Mark subtasks complete
kanmd checklist toggle implement-user-authentication 1 --json

# Update priority
kanmd priority implement-user-authentication high --json

# Reorder within priority group (move to position 1)
kanmd rank implement-user-authentication 1 --json

# Mark complete
kanmd move implement-user-authentication done --json
```
