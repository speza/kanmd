import fs from 'fs/promises';
import path from 'path';
import type { Card, Board, Priority } from './types.js';
import { KanmdError } from './types.js';

const KANBAN_DIR = path.join(process.cwd(), '.kanban');

interface Frontmatter {
  priority?: string;
  labels?: string[];
  dependencies?: string[];
  created?: string;
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
        } else if (key === 'dependencies') {
          if (value === '') {
            frontmatter.dependencies = [];
          } else {
            frontmatter.dependencies = value
              .split(',')
              .map((d) => d.trim())
              .filter(Boolean);
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
    dependencies: frontmatter.dependencies || [],
    created: frontmatter.created || '',
    description: '',
    checklist: [],
    column,
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

  const dependencies = card.dependencies || [];
  if (dependencies.length > 0) {
    lines.push(`dependencies: ${dependencies.join(', ')}`);
  } else {
    lines.push('dependencies:');
  }

  lines.push(`created: ${card.created || new Date().toISOString().split('T')[0]}`);
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
    dependencies: [],
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

  const fromPath = path.join(KANBAN_DIR, card.column, `${cardId}.md`);
  const toPath = path.join(KANBAN_DIR, toColumn, `${cardId}.md`);

  // Verify paths are within kanban directory
  assertPathWithinBase(fromPath, KANBAN_DIR);
  assertPathWithinBase(toPath, KANBAN_DIR);

  await fs.rename(fromPath, toPath);
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
