#!/usr/bin/env node

import { loadBoard, addCard, moveCard, deleteCard, getCard, editCard } from './files.js';
import type { Card } from './types.js';
import { isValidPriority } from './types.js';

const VERSION = '1.0.0';

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
  return cards.sort((a, b) => {
    const diff = priorityOrder[a.priority] - priorityOrder[b.priority];
    if (diff !== 0) return diff;
    return a.created.localeCompare(b.created);
  });
}

function formatColumnName(name: string): string {
  return name
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

async function showBoard(): Promise<void> {
  const board = await loadBoard();

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

async function showCard(cardId: string): Promise<void> {
  const card = await getCard(cardId);

  console.log();
  console.log(`${colors.bold}${card.title}${colors.reset}`);
  console.log(`${colors.dim}ID: ${card.id}${colors.reset}`);
  console.log();
  console.log(`Column:   ${formatColumnName(card.column)}`);
  console.log(`Priority: ${priorityColors[card.priority]}${card.priority}${colors.reset}`);
  console.log(`Created:  ${card.created}`);

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
    for (const item of card.checklist) {
      const check = item.checked
        ? `${colors.green}✓${colors.reset}`
        : `${colors.dim}○${colors.reset}`;
      const text = item.checked ? `${colors.dim}${item.text}${colors.reset}` : item.text;
      console.log(`  ${check} ${text}`);
    }
  }
  console.log();
}

async function handleAdd(args: string[]): Promise<void> {
  const column = args[0];
  const title = args.slice(1).join(' ');

  if (!column || !title) {
    throw new Error('Usage: kanmd add <column> <title>');
  }

  const card = await addCard(column, title);
  console.log(`Created ${colors.green}${card.id}${colors.reset} in ${formatColumnName(column)}`);
}

async function handleMove(args: string[]): Promise<void> {
  const [cardId, toColumn] = args;

  if (!cardId || !toColumn) {
    throw new Error('Usage: kanmd move <card-id> <column>');
  }

  await moveCard(cardId, toColumn);
  console.log(`Moved ${colors.green}${cardId}${colors.reset} to ${formatColumnName(toColumn)}`);
}

async function handleDelete(args: string[]): Promise<void> {
  const cardId = args[0];

  if (!cardId) {
    throw new Error('Usage: kanmd delete <card-id>');
  }

  await deleteCard(cardId);
  console.log(`Deleted ${colors.red}${cardId}${colors.reset}`);
}

async function handlePriority(args: string[]): Promise<void> {
  const [cardId, priority] = args;

  if (!cardId || !priority) {
    throw new Error('Usage: kanmd priority <card-id> <high|medium|low>');
  }

  if (!isValidPriority(priority)) {
    throw new Error(`Invalid priority "${priority}". Must be: high, medium, or low`);
  }

  await editCard(cardId, { priority });
  console.log(`Set ${cardId} priority to ${priorityColors[priority]}${priority}${colors.reset}`);
}

async function handleEdit(args: string[]): Promise<void> {
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
  console.log(`Updated ${colors.green}${cardId}${colors.reset}`);
}

async function handleShow(args: string[]): Promise<void> {
  const cardId = args[0];
  if (!cardId) {
    throw new Error('Usage: kanmd show <card-id>');
  }
  await showCard(cardId);
}

function showHelp(): void {
  console.log(`
${colors.bold}kanmd${colors.reset} - Markdown-backed Kanban CLI

${colors.bold}Usage:${colors.reset}
  kanmd                          Show the board
  kanmd show <card-id>           Show card details
  kanmd add <column> <title>     Add a card
  kanmd move <card-id> <column>  Move a card
  kanmd delete <card-id>         Delete a card
  kanmd priority <card-id> <p>   Set priority (high|medium|low)
  kanmd edit <card-id> [options] Edit card fields
  kanmd help                     Show this help
  kanmd --version                Show version

${colors.bold}Edit Options:${colors.reset}
  --title <text>                 Update the card title
  --description, -d <text>       Update the description
  --labels, -l <labels>          Set labels (comma-separated)

${colors.bold}Examples:${colors.reset}
  kanmd add todo "Build login page"
  kanmd move build-login-page in-progress
  kanmd priority build-login-page high
  kanmd edit build-login-page --title "New title" --labels "feature,auth"
  kanmd show build-login-page
  kanmd delete build-login-page
`);
}

function showVersion(): void {
  console.log(`kanmd v${VERSION}`);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const command = args[0];

  try {
    switch (command) {
      case undefined:
      case 'list':
      case 'ls':
        await showBoard();
        break;
      case 'show':
      case 'view':
        await handleShow(args.slice(1));
        break;
      case 'add':
      case 'new':
      case 'create':
        await handleAdd(args.slice(1));
        break;
      case 'move':
      case 'mv':
        await handleMove(args.slice(1));
        break;
      case 'delete':
      case 'rm':
      case 'remove':
        await handleDelete(args.slice(1));
        break;
      case 'priority':
      case 'pri':
        await handlePriority(args.slice(1));
        break;
      case 'edit':
        await handleEdit(args.slice(1));
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
        console.error(`Unknown command: ${command}`);
        showHelp();
        process.exit(1);
    }
  } catch (err) {
    console.error(`${colors.red}Error:${colors.reset} ${(err as Error).message}`);
    process.exit(1);
  }
}

main();
