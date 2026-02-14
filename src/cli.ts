#!/usr/bin/env node

import { createRequire } from 'module';
import {
  loadBoard,
  addCard,
  moveCard,
  deleteCard,
  getCard,
  editCard,
  rankCard,
  checklistAdd,
  checklistToggle,
  checklistRemove,
  getKanbanDir,
} from './files.js';
import { watchBoard } from './watch.js';
import type { Card } from './types.js';
import { isValidPriority, KanmdError } from './types.js';

const require = createRequire(import.meta.url);
const { version: VERSION } = require('../package.json');

// ANSI colors
const colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
};

const priorityColors: Record<Card['priority'], string> = {
  high: colors.red,
  medium: colors.yellow,
  low: colors.green,
};

function sortCards(cards: Card[]): Card[] {
  const priorityOrder: Record<Card['priority'], number> = { high: 0, medium: 1, low: 2 };
  return [...cards].sort((a, b) => {
    const priorityDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
    if (priorityDiff !== 0) return priorityDiff;

    const aRank = a.rank ?? Number.MAX_SAFE_INTEGER;
    const bRank = b.rank ?? Number.MAX_SAFE_INTEGER;
    const rankDiff = aRank - bRank;
    if (rankDiff !== 0) return rankDiff;

    return a.created.localeCompare(b.created);
  });
}

function formatColumnName(name: string): string {
  return name
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

function jsonOut(data: unknown): void {
  console.log(JSON.stringify(data));
}

function stripUndefined(obj: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined));
}

function cardToJson(card: Card): Record<string, unknown> {
  return stripUndefined({
    id: card.id,
    title: card.title,
    column: card.column,
    priority: card.priority,
    labels: card.labels,
    created: card.created,
    updated: card.updated,
    description: card.description,
    checklist: card.checklist,
    rank: card.rank,
  });
}

async function showBoard(json: boolean): Promise<void> {
  const board = await loadBoard();

  if (json) {
    const columns: Record<string, unknown[]> = {};
    for (const column of board.columns) {
      columns[column] = sortCards(board.cards.filter((c) => c.column === column)).map(cardToJson);
    }
    jsonOut({ columns: board.columns, cards: columns });
    return;
  }

  console.log();
  for (const column of board.columns) {
    const cards = sortCards(board.cards.filter((c) => c.column === column));
    console.log(
      `${colors.bold}${formatColumnName(column)}${colors.reset} ${colors.dim}(${cards.length})${colors.reset}`
    );

    if (cards.length === 0) {
      console.log(`  ${colors.dim}(empty)${colors.reset}`);
    } else {
      for (const card of cards) {
        const pColor = priorityColors[card.priority];
        const checkProgress = card.checklist.length
          ? ` ${colors.dim}[${card.checklist.filter((c) => c.checked).length}/${card.checklist.length}]${colors.reset}`
          : '';
        console.log(
          `  ${pColor}●${colors.reset} ${card.title}${checkProgress} ${colors.dim}(${card.id})${colors.reset}`
        );
      }
    }
    console.log();
  }
}

async function showCard(cardId: string, json: boolean): Promise<void> {
  const card = await getCard(cardId);

  if (json) {
    jsonOut(cardToJson(card));
    return;
  }

  console.log();
  console.log(`${colors.bold}${card.title}${colors.reset}`);
  console.log(`${colors.dim}ID: ${card.id}${colors.reset}`);
  console.log();
  console.log(`Column:   ${formatColumnName(card.column)}`);
  console.log(`Priority: ${priorityColors[card.priority]}${card.priority}${colors.reset}`);
  console.log(`Created:  ${card.created}`);
  if (card.updated) {
    console.log(`Updated:  ${card.updated}`);
  }

  if (card.labels.length > 0) {
    console.log(
      `Labels:   ${card.labels.map((l) => `${colors.cyan}${l}${colors.reset}`).join(', ')}`
    );
  }

  if (card.description) {
    console.log();
    console.log(`${colors.bold}Description${colors.reset}`);
    console.log(card.description);
  }

  if (card.checklist.length > 0) {
    console.log();
    console.log(`${colors.bold}Checklist${colors.reset}`);
    for (let i = 0; i < card.checklist.length; i++) {
      const item = card.checklist[i];
      const check = item.checked
        ? `${colors.green}✓${colors.reset}`
        : `${colors.dim}○${colors.reset}`;
      const text = item.checked ? `${colors.dim}${item.text}${colors.reset}` : item.text;
      console.log(`  ${colors.dim}${i + 1}.${colors.reset} ${check} ${text}`);
    }
  }
  console.log();
}

async function handleAdd(args: string[], json: boolean): Promise<void> {
  const column = args[0];
  const title = args.slice(1).join(' ');

  if (!column || !title) {
    throw new Error('Usage: kanmd add <column> <title>');
  }

  const card = await addCard(column, title);

  if (json) {
    jsonOut(cardToJson(card));
    return;
  }
  console.log(`Created ${colors.green}${card.id}${colors.reset} in ${formatColumnName(column)}`);
}

async function handleMove(args: string[], json: boolean): Promise<void> {
  const [cardId, toColumn] = args;

  if (!cardId || !toColumn) {
    throw new Error('Usage: kanmd move <card-id> <column>');
  }

  await moveCard(cardId, toColumn);

  if (json) {
    jsonOut({ ok: true, id: cardId, column: toColumn });
    return;
  }
  console.log(`Moved ${colors.green}${cardId}${colors.reset} to ${formatColumnName(toColumn)}`);
}

async function handleDelete(args: string[], json: boolean): Promise<void> {
  const cardId = args[0];

  if (!cardId) {
    throw new Error('Usage: kanmd delete <card-id>');
  }

  await deleteCard(cardId);

  if (json) {
    jsonOut({ ok: true, id: cardId });
    return;
  }
  console.log(`Deleted ${colors.red}${cardId}${colors.reset}`);
}

async function handlePriority(args: string[], json: boolean): Promise<void> {
  const [cardId, priority] = args;

  if (!cardId || !priority) {
    throw new Error('Usage: kanmd priority <card-id> <high|medium|low>');
  }

  if (!isValidPriority(priority)) {
    throw new Error(`Invalid priority "${priority}". Must be: high, medium, or low`);
  }

  // Clear rank when priority changes (card moves to different priority group)
  await editCard(cardId, { priority, rank: undefined });

  if (json) {
    jsonOut({ ok: true, id: cardId, priority });
    return;
  }
  console.log(`Set ${cardId} priority to ${priorityColors[priority]}${priority}${colors.reset}`);
}

async function handleRank(args: string[], json: boolean): Promise<void> {
  const [cardId, positionStr] = args;

  if (!cardId || !positionStr) {
    throw new Error('Usage: kanmd rank <card-id> <position>');
  }

  const position = parseInt(positionStr, 10);
  if (isNaN(position) || position < 1) {
    throw new Error('Position must be a positive integer');
  }

  await rankCard(cardId, position);

  if (json) {
    jsonOut({ ok: true, id: cardId, position });
    return;
  }
  console.log(`Moved ${colors.green}${cardId}${colors.reset} to position ${position}`);
}

async function handleEdit(args: string[], json: boolean): Promise<void> {
  const cardId = args[0];
  if (!cardId) {
    throw new Error('Usage: kanmd edit <card-id> [--title <text>] [-d <text>] [-l <labels>]');
  }

  const updates: Partial<Card> = {};
  let i = 1;
  while (i < args.length) {
    const flag = args[i];
    i++;
    if (i >= args.length) {
      throw new Error(`Missing value for ${flag}`);
    }
    const value = args[i];
    i++;

    switch (flag) {
      case '--title':
        updates.title = value;
        break;
      case '--description':
      case '-d':
        updates.description = value;
        break;
      case '--labels':
      case '-l':
        updates.labels = value
          .split(',')
          .map((l) => l.trim())
          .filter(Boolean);
        break;
      default:
        throw new Error(`Unknown flag: ${flag}`);
    }
  }

  if (Object.keys(updates).length === 0) {
    throw new Error('No updates provided. Use --title, --description, or --labels.');
  }

  await editCard(cardId, updates);

  if (json) {
    const card = await getCard(cardId);
    jsonOut(cardToJson(card));
    return;
  }
  console.log(`Updated ${colors.green}${cardId}${colors.reset}`);
}

async function handleChecklist(args: string[], json: boolean): Promise<void> {
  const subcommand = args[0];
  const cardId = args[1];

  if (!subcommand || !cardId) {
    throw new Error(
      'Usage: kanmd checklist <add|toggle|remove> <card-id> <text|index>'
    );
  }

  switch (subcommand) {
    case 'add': {
      const text = args.slice(2).join(' ');
      if (!text) {
        throw new Error('Usage: kanmd checklist add <card-id> <text>');
      }
      const card = await checklistAdd(cardId, text);
      if (json) {
        jsonOut(cardToJson(card));
        return;
      }
      console.log(
        `Added checklist item to ${colors.green}${cardId}${colors.reset}: ${text}`
      );
      break;
    }
    case 'toggle': {
      const indexStr = args[2];
      if (!indexStr) {
        throw new Error('Usage: kanmd checklist toggle <card-id> <index>');
      }
      const index = parseInt(indexStr, 10);
      if (isNaN(index) || index < 1) {
        throw new Error('Index must be a positive integer');
      }
      const card = await checklistToggle(cardId, index);
      const item = card.checklist[index - 1];
      if (json) {
        jsonOut(cardToJson(card));
        return;
      }
      const state = item.checked ? `${colors.green}checked${colors.reset}` : 'unchecked';
      console.log(
        `Toggled item ${index} on ${colors.green}${cardId}${colors.reset}: ${state}`
      );
      break;
    }
    case 'remove': {
      const idxStr = args[2];
      if (!idxStr) {
        throw new Error('Usage: kanmd checklist remove <card-id> <index>');
      }
      const idx = parseInt(idxStr, 10);
      if (isNaN(idx) || idx < 1) {
        throw new Error('Index must be a positive integer');
      }
      const card = await checklistRemove(cardId, idx);
      if (json) {
        jsonOut(cardToJson(card));
        return;
      }
      console.log(`Removed checklist item ${idx} from ${colors.green}${cardId}${colors.reset}`);
      break;
    }
    default:
      throw new Error(
        `Unknown checklist subcommand: "${subcommand}". Use: add, toggle, remove`
      );
  }
}

async function handleShow(args: string[], json: boolean): Promise<void> {
  const cardId = args[0];
  if (!cardId) {
    throw new Error('Usage: kanmd show <card-id>');
  }
  await showCard(cardId, json);
}

async function handleWatch(): Promise<void> {
  await watchBoard(getKanbanDir(), () => showBoard(false));
}

function showHelp(): void {
  console.log(`
${colors.bold}kanmd${colors.reset} - Markdown-backed Kanban CLI

${colors.bold}Usage:${colors.reset}
  kanmd                                Show the board
  kanmd show <card-id>                 Show card details
  kanmd add <column> <title>           Add a card
  kanmd move <card-id> <column>        Move a card
  kanmd delete <card-id>               Delete a card
  kanmd priority <card-id> <p>         Set priority (high|medium|low)
  kanmd rank <card-id> <pos>           Set position within priority group
  kanmd edit <card-id> [options]       Edit card fields
  kanmd checklist add <id> <text>      Add checklist item
  kanmd checklist toggle <id> <index>  Toggle checklist item
  kanmd checklist remove <id> <index>  Remove checklist item
  kanmd watch                          Watch board for changes
  kanmd help                           Show this help
  kanmd --version                      Show version

${colors.bold}Edit Options:${colors.reset}
  --title <text>                 Update the card title
  --description, -d <text>       Update the description
  --labels, -l <labels>          Set labels (comma-separated)

${colors.bold}JSON Output:${colors.reset}
  --json                         Output machine-readable JSON (all commands)

${colors.bold}Examples:${colors.reset}
  kanmd add todo "Build login page"
  kanmd move build-login-page in-progress
  kanmd priority build-login-page high
  kanmd rank build-login-page 1
  kanmd edit build-login-page --title "New title" --labels "feature,auth"
  kanmd checklist add build-login-page "Write tests"
  kanmd checklist toggle build-login-page 1
  kanmd show build-login-page
  kanmd show build-login-page --json
  kanmd delete build-login-page
`);
}

function showVersion(): void {
  console.log(`kanmd v${VERSION}`);
}

function extractJsonFlag(args: string[]): { json: boolean; rest: string[] } {
  const jsonIndex = args.indexOf('--json');
  if (jsonIndex === -1) return { json: false, rest: args };
  const rest = [...args];
  rest.splice(jsonIndex, 1);
  return { json: true, rest };
}

async function main(): Promise<void> {
  const rawArgs = process.argv.slice(2);
  const { json, rest: args } = extractJsonFlag(rawArgs);
  const command = args[0];

  try {
    switch (command) {
      case undefined:
      case 'list':
      case 'ls':
        await showBoard(json);
        break;
      case 'show':
      case 'view':
        await handleShow(args.slice(1), json);
        break;
      case 'add':
      case 'new':
      case 'create':
        await handleAdd(args.slice(1), json);
        break;
      case 'move':
      case 'mv':
        await handleMove(args.slice(1), json);
        break;
      case 'delete':
      case 'rm':
      case 'remove':
        await handleDelete(args.slice(1), json);
        break;
      case 'priority':
      case 'pri':
        await handlePriority(args.slice(1), json);
        break;
      case 'rank':
        await handleRank(args.slice(1), json);
        break;
      case 'edit':
        await handleEdit(args.slice(1), json);
        break;
      case 'checklist':
      case 'cl':
        await handleChecklist(args.slice(1), json);
        break;
      case 'watch':
      case 'tail':
        await handleWatch();
        break;
      case 'help':
      case '--help':
      case '-h':
        showHelp();
        break;
      case '--version':
      case '-v':
        showVersion();
        break;
      default:
        if (json) {
          jsonOut({ error: `Unknown command: ${command}`, code: 'UNKNOWN_COMMAND' });
          process.exit(1);
        }
        console.error(`Unknown command: ${command}`);
        showHelp();
        process.exit(1);
    }
  } catch (err) {
    if (json) {
      const error = err as Error;
      const code = err instanceof KanmdError ? (err as KanmdError).code : 'ERROR';
      jsonOut({ error: error.message, code });
      process.exit(1);
    }
    console.error(`${colors.red}Error:${colors.reset} ${(err as Error).message}`);
    process.exit(1);
  }
}

main();
