# kanmd

An agent-friendly, markdown-backed Kanban CLI for managing tasks.

![kanmd board example](public/todo_list_1.png)

## Why kanmd?

**Built for AI agents and humans alike.** kanmd stores tasks as plain markdown files that are easy for both humans and AI agents to read, create, and modify. The simple CLI makes it ideal for automated workflows and agentic task management.

- **Plain text storage** - Cards are markdown files with YAML frontmatter, perfect for version control and agent parsing
- **Simple CLI** - Predictable commands that agents can invoke reliably
- **No database** - Everything lives in `.kanmd/` directory as readable files
- **Conflict-free collaboration** - One file per card means multiple users or agent sessions can add, move, and edit different cards without merge conflicts
- **Portable** - Runs anywhere Node.js runs

## Installation

```bash
npm install -g kanmd
```

Or with other package managers:

```bash
yarn global add kanmd
pnpm add -g kanmd
```

## Claude Code Plugin

Install as a Claude Code plugin to use the `/kanmd` skill:

```bash
/plugin marketplace add git@github.com:speza/kanmd.git
```

This enables the `/kanmd` skill in Claude Code for managing tasks directly in conversations.

## Quick Start

```bash
# Initialize a board (creates .kanmd/ directory)
kanmd

# Add tasks
kanmd add todo "Implement user authentication"
kanmd add todo "Write API documentation"

# View the board
kanmd

# Move tasks through columns
kanmd move implement-user-authentication in-progress
kanmd move implement-user-authentication done
```

## Commands

| Command | Description |
|---------|-------------|
| `kanmd` | Show the board |
| `kanmd add <column> <title>` | Add a card |
| `kanmd show <card-id>` | Show card details |
| `kanmd move <card-id> <column>` | Move a card |
| `kanmd priority <card-id> <high\|medium\|low>` | Set priority |
| `kanmd edit <card-id> [options]` | Edit card fields |
| `kanmd delete <card-id>` | Delete a card |
| `kanmd rank <card-id> <position>` | Set position within priority group |
| `kanmd help` | Show help and usage examples |

### Edit Options

```bash
kanmd edit <card-id> --title "New title"
kanmd edit <card-id> -d "New description"
kanmd edit <card-id> -l "label1,label2"
```

### Ranking

Within each priority level, cards can be manually ordered using the rank command:

```bash
kanmd rank my-task 1    # Move to first position in priority group
kanmd rank my-task 3    # Move to third position
```

Rank is automatically cleared when a card's priority changes or when it moves to a different column.

## Data Storage

All data is stored in a `.kanmd/` directory:

```
.kanmd/
├── board.yaml           # Board configuration
├── todo/
│   └── my-task.md       # Card as markdown
├── in-progress/
├── review/
└── done/
```

### Card Format

Cards are markdown files with YAML frontmatter:

```markdown
---
priority: high
labels: feature, auth
created: 2024-01-15
---

# Implement user authentication

## Description
Add OAuth2 login with Google and GitHub providers.

## Checklist
- [x] Design auth flow
- [ ] Implement OAuth
- [ ] Add session management
```

### Board Configuration

The `board.yaml` file defines columns:

```yaml
name: Project Board
columns:
  - todo
  - in-progress
  - review
  - done
```

## Agent Integration

kanmd is designed for use with AI coding agents. The plain-text format means agents can:

- Read `.kanmd/` files directly to understand project status
- Use the CLI to create and manage tasks programmatically
- Parse card markdown to extract requirements and checklists
- Track progress through version control diffs

Example agent workflow:
```bash
# Agent checks current tasks
kanmd

# Agent creates a task for work it will do
kanmd add in-progress "Refactor authentication module"

# Agent completes work and moves task
kanmd move refactor-authentication-module done
```

## Development

Requires [Bun](https://bun.sh) for development.

```bash
# Install dependencies
bun install

# Run tests
bun test

# Run CLI in dev mode
bun run dev

# Type check
bun run typecheck
```

## License

MIT
