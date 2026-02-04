import fs from 'fs/promises';
import path from 'path';
import type { Card, Board, Priority } from './types.js';
import { KanmdError } from './types.js';

const KANBAN_DIR = process.env.KANMD_DIR
  ? path.resolve(process.env.KANMD_DIR)
  : path.join(process.cwd(), '.kanban');

interface Frontmatter {
  priority?: string;
  labels?: string[];
  created?: string;
  rank?: number;
}

/**
 * Validates that a path component (column name, card ID) contains only safe characters.
 * Prevents path traversal attacks.
 */
export function validatePathComponent(component: string): void {
  if (!/^[a-z0-9_-]+$/i.test(component)) {
    throw new KanmdError(
      `Invalid name: "${component}". Only alphanumeric, hyphens, and underscores allowed.`,
      'INVALID_NAME'
    );
  }
  if (component === '.' || component === '..') {
    throw new KanmdError(`Invalid name: "${component}"`, 'INVALID_NAME');
  }
}

/**
 * Ensures a target path is contained within the base path.
 * Prevents directory traversal attacks.
 */
function assertPathWithinBase(targetPath: string, basePath: string): void {
  const resolved = path.resolve(targetPath);
  const baseResolved = path.resolve(basePath);
  if (!resolved.startsWith(baseResolved + path.sep) && resolved !== baseResolved) {
    throw new KanmdError('Invalid path', 'PATH_TRAVERSAL');
  }
}

export function parseFrontmatter(markdown: string): { frontmatter: Frontmatter; content: string } {
  const frontmatter: Frontmatter = {};
  let content = markdown;

  if (markdown.startsWith('---')) {
    const endIndex = markdown.indexOf('---', 3);
    if (endIndex !== -1) {
      const yamlBlock = markdown.slice(3, endIndex).trim();
      content = markdown.slice(endIndex + 3).trim();

      for (const line of yamlBlock.split('\n')) {
        const colonIndex = line.indexOf(':');
        if (colonIndex === -1) continue;

        const key = line.slice(0, colonIndex).trim();
        const value = line.slice(colonIndex + 1).trim();

        if (key === 'labels') {
          if (value === '') {
            frontmatter.labels = [];
          } else {
            frontmatter.labels = value
              .split(',')
              .map((l) => l.trim())
              .filter(Boolean);
          }
        } else if (key === 'rank') {
          const parsed = parseInt(value, 10);
          if (!isNaN(parsed)) {
            frontmatter.rank = parsed;
          }
        } else {
          (frontmatter as Record<string, string>)[key] = value;
        }
      }
    }
  }

  return { frontmatter, content };
}

export function parseCard(markdown: string, filename: string, column: string): Card {
  const { frontmatter, content } = parseFrontmatter(markdown);
  const lines = content.split('\n');

  const card: Card = {
    id: filename.replace('.md', ''),
    title: '',
    priority: (frontmatter.priority as Card['priority']) || 'medium',
    labels: frontmatter.labels || [],
    created: frontmatter.created || '',
    description: '',
    checklist: [],
    column,
    rank: frontmatter.rank,
  };

  let section = 'header';
  const descriptionLines: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed.startsWith('# ') && !card.title) {
      card.title = trimmed.slice(2).trim();
      continue;
    }

    if (trimmed === '## Description') {
      section = 'description';
      continue;
    }

    if (trimmed === '## Checklist') {
      section = 'checklist';
      continue;
    }

    if (trimmed.startsWith('## ')) {
      section = 'other';
      continue;
    }

    if (section === 'description') {
      descriptionLines.push(line);
    } else if (section === 'checklist') {
      const checkMatch = trimmed.match(/^- \[([ x])\] (.+)$/);
      if (checkMatch) {
        card.checklist.push({
          checked: checkMatch[1] === 'x',
          text: checkMatch[2],
        });
      }
    }
  }

  card.description = descriptionLines.join('\n').trim();
  return card;
}

export function serializeCard(card: Partial<Card>): string {
  const lines: string[] = [];

  lines.push('---');
  lines.push(`priority: ${card.priority || 'medium'}`);

  const labels = card.labels || [];
  if (labels.length > 0) {
    lines.push(`labels: ${labels.join(', ')}`);
  } else {
    lines.push('labels:');
  }

  lines.push(`created: ${card.created || new Date().toISOString().split('T')[0]}`);
  if (card.rank !== undefined) {
    lines.push(`rank: ${card.rank}`);
  }
  lines.push('---');
  lines.push('');
  lines.push(`# ${card.title || 'Untitled'}`);

  if (card.description) {
    lines.push('');
    lines.push('## Description');
    lines.push(card.description);
  }

  if (card.checklist && card.checklist.length > 0) {
    lines.push('');
    lines.push('## Checklist');
    for (const item of card.checklist) {
      const checkbox = item.checked ? '[x]' : '[ ]';
      lines.push(`- ${checkbox} ${item.text}`);
    }
  }

  return lines.join('\n') + '\n';
}

export async function ensureBoard(): Promise<void> {
  await fs.mkdir(KANBAN_DIR, { recursive: true });

  const boardPath = path.join(KANBAN_DIR, 'board.yaml');
  try {
    await fs.access(boardPath);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      const defaultBoard = `name: Project Board
columns:
  - todo
  - in-progress
  - review
  - done
`;
      await fs.writeFile(boardPath, defaultBoard);
    } else {
      throw err;
    }
  }
}

export async function loadBoard(): Promise<Board> {
  await ensureBoard();

  // Read board config (YAML format)
  const boardPath = path.join(KANBAN_DIR, 'board.yaml');
  const boardContent = await fs.readFile(boardPath, 'utf-8');

  const columns: string[] = [];
  let inColumnsSection = false;

  for (const line of boardContent.split('\n')) {
    const trimmed = line.trim();
    if (trimmed === 'columns:') {
      inColumnsSection = true;
      continue;
    }
    // Stop if we hit another top-level key
    if (inColumnsSection && !line.startsWith(' ') && !line.startsWith('\t') && trimmed !== '') {
      break;
    }
    if (inColumnsSection && trimmed.startsWith('- ')) {
      columns.push(trimmed.slice(2).trim());
    }
  }

  // Ensure column directories exist
  for (const col of columns) {
    await fs.mkdir(path.join(KANBAN_DIR, col), { recursive: true });
  }

  // Load all cards
  const cards: Card[] = [];

  for (const column of columns) {
    const columnPath = path.join(KANBAN_DIR, column);
    try {
      const files = await fs.readdir(columnPath);
      for (const file of files) {
        if (file.endsWith('.md')) {
          const content = await fs.readFile(path.join(columnPath, file), 'utf-8');
          cards.push(parseCard(content, file, column));
        }
      }
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw err;
      }
      // Column dir doesn't exist yet, skip
    }
  }

  return { columns, cards };
}

export async function addCard(
  column: string,
  title: string,
  priority: Priority = 'medium'
): Promise<Card> {
  // Validate column name before any operations
  validatePathComponent(column);

  const board = await loadBoard();

  if (!board.columns.includes(column)) {
    throw new KanmdError(
      `Column "${column}" doesn't exist. Available: ${board.columns.join(', ')}`,
      'COLUMN_NOT_FOUND'
    );
  }

  const id = title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .substring(0, 50);

  // Validate generated ID
  if (!id || !/^[a-z0-9-]+$/.test(id)) {
    throw new KanmdError(
      `Cannot generate valid ID from title "${title}". Title must contain some alphanumeric characters.`,
      'INVALID_TITLE'
    );
  }

  const card: Card = {
    id,
    title,
    priority,
    labels: [],
    created: new Date().toISOString().split('T')[0],
    description: '',
    checklist: [],
    column,
  };

  const cardPath = path.join(KANBAN_DIR, column, `${id}.md`);

  // Verify path is within kanban directory
  assertPathWithinBase(cardPath, KANBAN_DIR);

  // Atomic exclusive file creation - fails if file exists
  try {
    await fs.writeFile(cardPath, serializeCard(card), { flag: 'wx' });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'EEXIST') {
      throw new KanmdError(`Card "${id}" already exists in ${column}`, 'CARD_EXISTS');
    }
    throw err;
  }

  return card;
}

export async function moveCard(cardId: string, toColumn: string): Promise<void> {
  // Validate inputs
  validatePathComponent(cardId);
  validatePathComponent(toColumn);

  const board = await loadBoard();

  if (!board.columns.includes(toColumn)) {
    throw new KanmdError(
      `Column "${toColumn}" doesn't exist. Available: ${board.columns.join(', ')}`,
      'COLUMN_NOT_FOUND'
    );
  }

  const card = board.cards.find((c) => c.id === cardId);
  if (!card) {
    throw new KanmdError(`Card "${cardId}" not found`, 'CARD_NOT_FOUND');
  }

  if (card.column === toColumn) {
    throw new KanmdError(`Card is already in "${toColumn}"`, 'ALREADY_IN_COLUMN');
  }

  // Clear rank when moving to a new column (card sorts to end)
  const updatedCard = { ...card, rank: undefined };
  const fromPath = path.join(KANBAN_DIR, card.column, `${cardId}.md`);
  const toPath = path.join(KANBAN_DIR, toColumn, `${cardId}.md`);

  // Verify paths are within kanban directory
  assertPathWithinBase(fromPath, KANBAN_DIR);
  assertPathWithinBase(toPath, KANBAN_DIR);

  // Write updated card (without rank) to new location, then delete old file
  // Use 'wx' flag to fail if target already exists (e.g., from a previous failed move)
  try {
    await fs.writeFile(toPath, serializeCard(updatedCard), { flag: 'wx' });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'EEXIST') {
      throw new KanmdError(
        `Card "${cardId}" already exists in ${toColumn}. Remove the duplicate first.`,
        'CARD_EXISTS'
      );
    }
    throw err;
  }
  await fs.unlink(fromPath);
}

export async function deleteCard(cardId: string): Promise<void> {
  validatePathComponent(cardId);

  const board = await loadBoard();
  const card = board.cards.find((c) => c.id === cardId);

  if (!card) {
    throw new KanmdError(`Card "${cardId}" not found`, 'CARD_NOT_FOUND');
  }

  const cardPath = path.join(KANBAN_DIR, card.column, `${cardId}.md`);
  assertPathWithinBase(cardPath, KANBAN_DIR);

  await fs.unlink(cardPath);
}

export async function getCard(cardId: string): Promise<Card> {
  validatePathComponent(cardId);

  const board = await loadBoard();
  const card = board.cards.find((c) => c.id === cardId);

  if (!card) {
    throw new KanmdError(`Card "${cardId}" not found`, 'CARD_NOT_FOUND');
  }

  return card;
}

export async function editCard(cardId: string, updates: Partial<Card>): Promise<void> {
  validatePathComponent(cardId);

  const board = await loadBoard();
  const card = board.cards.find((c) => c.id === cardId);

  if (!card) {
    throw new KanmdError(`Card "${cardId}" not found`, 'CARD_NOT_FOUND');
  }

  const updatedCard = { ...card, ...updates };
  const cardPath = path.join(KANBAN_DIR, card.column, `${cardId}.md`);
  assertPathWithinBase(cardPath, KANBAN_DIR);

  // Atomic write: write to temp file, then rename
  const tempPath = cardPath + '.tmp';
  await fs.writeFile(tempPath, serializeCard(updatedCard));
  await fs.rename(tempPath, cardPath);
}

export async function rankCard(cardId: string, newPosition: number): Promise<void> {
  validatePathComponent(cardId);

  if (newPosition < 1) {
    throw new KanmdError('Position must be 1 or greater', 'INVALID_POSITION');
  }

  const board = await loadBoard();
  const card = board.cards.find((c) => c.id === cardId);

  if (!card) {
    throw new KanmdError(`Card "${cardId}" not found`, 'CARD_NOT_FOUND');
  }

  // Get all cards in the same column and priority group
  const groupCards = board.cards.filter(
    (c) => c.column === card.column && c.priority === card.priority
  );

  // Sort the group by current rank (unranked cards go to the end)
  groupCards.sort((a, b) => {
    const aRank = a.rank ?? Number.MAX_SAFE_INTEGER;
    const bRank = b.rank ?? Number.MAX_SAFE_INTEGER;
    if (aRank !== bRank) return aRank - bRank;
    return a.created.localeCompare(b.created);
  });

  // Remove the target card from its current position
  const cardIndex = groupCards.findIndex((c) => c.id === cardId);
  if (cardIndex !== -1) {
    groupCards.splice(cardIndex, 1);
  }

  // Insert at new position (1-indexed, so position 1 = index 0)
  const insertIndex = Math.min(newPosition - 1, groupCards.length);
  groupCards.splice(insertIndex, 0, card);

  // Renumber all cards in the group (1, 2, 3, ...)
  // Collect updates first, write to temp files, then rename all (reduces inconsistency window)
  const updates: Array<{ cardPath: string; tempPath: string; content: string }> = [];

  for (let i = 0; i < groupCards.length; i++) {
    const c = groupCards[i];
    const newRank = i + 1;

    // Only update cards whose rank actually changed
    if (c.rank !== newRank) {
      const cardPath = path.join(KANBAN_DIR, c.column, `${c.id}.md`);
      assertPathWithinBase(cardPath, KANBAN_DIR);

      const updatedCard = { ...c, rank: newRank };
      updates.push({
        cardPath,
        tempPath: cardPath + '.tmp',
        content: serializeCard(updatedCard),
      });
    }
  }

  // Phase 1: Write all temp files
  for (const update of updates) {
    await fs.writeFile(update.tempPath, update.content);
  }

  // Phase 2: Rename all temp files to final (atomic per-file)
  for (const update of updates) {
    await fs.rename(update.tempPath, update.cardPath);
  }
}
