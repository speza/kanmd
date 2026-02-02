import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import fs from 'fs/promises';
import path from 'path';
import {
  validatePathComponent,
  parseFrontmatter,
  parseCard,
  serializeCard,
  addCard,
  loadBoard,
  moveCard,
  deleteCard,
  editCard,
  getCard,
} from './files.js';
import { KanmdError } from './types.js';

const KANBAN_DIR = path.join(process.cwd(), '.kanban');

// Helper to set up test kanban directory
async function setupTestBoard(): Promise<void> {
  await fs.rm(KANBAN_DIR, { recursive: true, force: true });
  await fs.mkdir(KANBAN_DIR, { recursive: true });
  await fs.mkdir(path.join(KANBAN_DIR, 'todo'), { recursive: true });
  await fs.mkdir(path.join(KANBAN_DIR, 'in-progress'), { recursive: true });
  await fs.mkdir(path.join(KANBAN_DIR, 'done'), { recursive: true });

  const boardContent = `name: Project Board
columns:
  - todo
  - in-progress
  - done
`;
  await fs.writeFile(path.join(KANBAN_DIR, 'board.yaml'), boardContent);
}

async function cleanupTestBoard(): Promise<void> {
  await fs.rm(KANBAN_DIR, { recursive: true, force: true });
}

describe('validatePathComponent', () => {
  test('allows valid names', () => {
    expect(() => validatePathComponent('todo')).not.toThrow();
    expect(() => validatePathComponent('in-progress')).not.toThrow();
    expect(() => validatePathComponent('my_card')).not.toThrow();
    expect(() => validatePathComponent('Card123')).not.toThrow();
    expect(() => validatePathComponent('a')).not.toThrow();
    expect(() => validatePathComponent('abc-123_XYZ')).not.toThrow();
  });

  test('rejects path traversal attempts', () => {
    expect(() => validatePathComponent('..')).toThrow(KanmdError);
    expect(() => validatePathComponent('.')).toThrow(KanmdError);
    expect(() => validatePathComponent('../etc')).toThrow(KanmdError);
  });

  test('rejects special characters', () => {
    expect(() => validatePathComponent('foo/bar')).toThrow(KanmdError);
    expect(() => validatePathComponent('foo\\bar')).toThrow(KanmdError);
    expect(() => validatePathComponent('foo bar')).toThrow(KanmdError);
    expect(() => validatePathComponent('foo:bar')).toThrow(KanmdError);
    expect(() => validatePathComponent('foo*bar')).toThrow(KanmdError);
    expect(() => validatePathComponent('')).toThrow(KanmdError);
  });

  test('error has correct code', () => {
    try {
      validatePathComponent('../test');
    } catch (err) {
      expect(err).toBeInstanceOf(KanmdError);
      expect((err as KanmdError).code).toBe('INVALID_NAME');
    }
  });
});

describe('parseFrontmatter', () => {
  test('parses valid frontmatter', () => {
    const markdown = `---
priority: high
labels: bug, urgent
created: 2024-01-15
---

# Title`;

    const result = parseFrontmatter(markdown);
    expect(result.frontmatter.priority).toBe('high');
    expect(result.frontmatter.labels).toEqual(['bug', 'urgent']);
    expect(result.frontmatter.created).toBe('2024-01-15');
    expect(result.content).toBe('# Title');
  });

  test('handles empty frontmatter', () => {
    const markdown = `---
---

# Title`;

    const result = parseFrontmatter(markdown);
    expect(result.frontmatter).toEqual({});
    expect(result.content).toBe('# Title');
  });

  test('handles missing frontmatter', () => {
    const markdown = `# Title

Some content`;

    const result = parseFrontmatter(markdown);
    expect(result.frontmatter).toEqual({});
    expect(result.content).toBe(markdown);
  });

  test('handles empty labels correctly', () => {
    const markdown = `---
priority: medium
labels:
---

# Title`;

    const result = parseFrontmatter(markdown);
    expect(result.frontmatter.labels).toEqual([]);
  });

  test('parses labels correctly', () => {
    const markdown = `---
labels: feature, enhancement, ui
---

# Title`;

    const result = parseFrontmatter(markdown);
    expect(result.frontmatter.labels).toEqual(['feature', 'enhancement', 'ui']);
  });
});

describe('parseCard', () => {
  test('extracts title from heading', () => {
    const markdown = `---
priority: medium
labels:
created: 2024-01-15
---

# My Card Title`;

    const card = parseCard(markdown, 'my-card.md', 'todo');
    expect(card.title).toBe('My Card Title');
    expect(card.id).toBe('my-card');
    expect(card.column).toBe('todo');
  });

  test('extracts description section', () => {
    const markdown = `---
priority: medium
labels:
created: 2024-01-15
---

# Title

## Description
This is the description.
It has multiple lines.`;

    const card = parseCard(markdown, 'test.md', 'todo');
    expect(card.description).toBe('This is the description.\nIt has multiple lines.');
  });

  test('parses checklist items', () => {
    const markdown = `---
priority: medium
labels:
created: 2024-01-15
---

# Title

## Checklist
- [x] Done item
- [ ] Pending item
- [x] Another done`;

    const card = parseCard(markdown, 'test.md', 'todo');
    expect(card.checklist).toHaveLength(3);
    expect(card.checklist[0]).toEqual({ checked: true, text: 'Done item' });
    expect(card.checklist[1]).toEqual({ checked: false, text: 'Pending item' });
    expect(card.checklist[2]).toEqual({ checked: true, text: 'Another done' });
  });

  test('uses defaults for missing values', () => {
    const markdown = `# Just a title`;

    const card = parseCard(markdown, 'test.md', 'todo');
    expect(card.priority).toBe('medium');
    expect(card.labels).toEqual([]);
    expect(card.created).toBe('');
    expect(card.description).toBe('');
    expect(card.checklist).toEqual([]);
  });
});

describe('serializeCard', () => {
  test('round-trips card correctly', () => {
    const original = {
      id: 'test-card',
      title: 'Test Card',
      priority: 'high' as const,
      labels: ['bug', 'urgent'],
      created: '2024-01-15',
      description: 'This is a test description',
      checklist: [
        { checked: true, text: 'Step 1' },
        { checked: false, text: 'Step 2' },
      ],
      column: 'todo',
    };

    const serialized = serializeCard(original);
    const parsed = parseCard(serialized, 'test-card.md', 'todo');

    expect(parsed.title).toBe(original.title);
    expect(parsed.priority).toBe(original.priority);
    expect(parsed.labels).toEqual(original.labels);
    expect(parsed.created).toBe(original.created);
    expect(parsed.description).toBe(original.description);
    expect(parsed.checklist).toEqual(original.checklist);
  });

  test('handles empty labels', () => {
    const card = {
      title: 'Test',
      priority: 'medium' as const,
      labels: [],
      created: '2024-01-15',
    };

    const serialized = serializeCard(card);
    expect(serialized).toContain('labels:');
    expect(serialized).not.toContain('labels: ,');
  });

  test('handles card without optional fields', () => {
    const card = {
      title: 'Minimal Card',
    };

    const serialized = serializeCard(card);
    expect(serialized).toContain('# Minimal Card');
    expect(serialized).toContain('priority: medium');
    expect(serialized).not.toContain('## Description');
    expect(serialized).not.toContain('## Checklist');
  });
});

describe('addCard', () => {
  beforeEach(setupTestBoard);
  afterEach(cleanupTestBoard);

  test('creates card file', async () => {
    const card = await addCard('todo', 'My New Task');

    expect(card.id).toBe('my-new-task');
    expect(card.title).toBe('My New Task');
    expect(card.column).toBe('todo');
    expect(card.priority).toBe('medium');

    const cardPath = path.join(KANBAN_DIR, 'todo', 'my-new-task.md');
    const exists = await fs
      .access(cardPath)
      .then(() => true)
      .catch(() => false);
    expect(exists).toBe(true);
  });

  test('rejects invalid column', async () => {
    await expect(addCard('../etc', 'Test')).rejects.toThrow(KanmdError);
    await expect(addCard('nonexistent', 'Test')).rejects.toThrow("doesn't exist");
  });

  test('handles ID collision', async () => {
    await addCard('todo', 'Duplicate Task');
    await expect(addCard('todo', 'Duplicate Task')).rejects.toThrow('already exists');
  });

  test('rejects title that generates empty ID', async () => {
    await expect(addCard('todo', '...')).rejects.toThrow('Cannot generate valid ID');
  });

  test('creates card with custom priority', async () => {
    const card = await addCard('todo', 'High Priority Task', 'high');
    expect(card.priority).toBe('high');
  });
});

describe('moveCard', () => {
  beforeEach(setupTestBoard);
  afterEach(cleanupTestBoard);

  test('moves card between columns', async () => {
    await addCard('todo', 'Test Task');
    await moveCard('test-task', 'in-progress');

    const board = await loadBoard();
    const card = board.cards.find((c) => c.id === 'test-task');
    expect(card?.column).toBe('in-progress');
  });

  test('rejects invalid target column', async () => {
    await addCard('todo', 'Test Task');
    await expect(moveCard('test-task', '../etc')).rejects.toThrow(KanmdError);
    await expect(moveCard('test-task', 'nonexistent')).rejects.toThrow("doesn't exist");
  });

  test('rejects moving to same column', async () => {
    await addCard('todo', 'Test Task');
    await expect(moveCard('test-task', 'todo')).rejects.toThrow('already in');
  });

  test('rejects invalid card ID', async () => {
    await expect(moveCard('../etc', 'todo')).rejects.toThrow(KanmdError);
  });
});

describe('deleteCard', () => {
  beforeEach(setupTestBoard);
  afterEach(cleanupTestBoard);

  test('deletes existing card', async () => {
    await addCard('todo', 'To Delete');
    await deleteCard('to-delete');

    const board = await loadBoard();
    const card = board.cards.find((c) => c.id === 'to-delete');
    expect(card).toBeUndefined();
  });

  test('rejects nonexistent card', async () => {
    await expect(deleteCard('nonexistent')).rejects.toThrow('not found');
  });

  test('rejects invalid card ID', async () => {
    await expect(deleteCard('../etc')).rejects.toThrow(KanmdError);
  });
});

describe('editCard', () => {
  beforeEach(setupTestBoard);
  afterEach(cleanupTestBoard);

  test('updates card fields', async () => {
    await addCard('todo', 'Original Title');
    await editCard('original-title', {
      title: 'Updated Title',
      description: 'New description',
      labels: ['updated'],
    });

    const card = await getCard('original-title');
    expect(card.title).toBe('Updated Title');
    expect(card.description).toBe('New description');
    expect(card.labels).toEqual(['updated']);
  });

  test('preserves unchanged fields', async () => {
    await addCard('todo', 'Test Card', 'high');
    await editCard('test-card', { description: 'Added description' });

    const card = await getCard('test-card');
    expect(card.title).toBe('Test Card');
    expect(card.priority).toBe('high');
    expect(card.description).toBe('Added description');
  });

  test('rejects invalid card ID', async () => {
    await expect(editCard('../etc', { title: 'Hacked' })).rejects.toThrow(KanmdError);
  });

  test('rejects nonexistent card', async () => {
    await expect(editCard('nonexistent', { title: 'Test' })).rejects.toThrow('not found');
  });
});

describe('getCard', () => {
  beforeEach(setupTestBoard);
  afterEach(cleanupTestBoard);

  test('returns existing card', async () => {
    await addCard('todo', 'Find Me', 'high');
    const card = await getCard('find-me');

    expect(card.title).toBe('Find Me');
    expect(card.priority).toBe('high');
    expect(card.column).toBe('todo');
  });

  test('rejects invalid card ID', async () => {
    await expect(getCard('../etc')).rejects.toThrow(KanmdError);
  });

  test('rejects nonexistent card', async () => {
    await expect(getCard('nonexistent')).rejects.toThrow('not found');
  });
});

describe('loadBoard', () => {
  beforeEach(setupTestBoard);
  afterEach(cleanupTestBoard);

  test('loads columns from board.yaml', async () => {
    const board = await loadBoard();
    expect(board.columns).toEqual(['todo', 'in-progress', 'done']);
  });

  test('loads all cards from columns', async () => {
    await addCard('todo', 'Task 1');
    await addCard('todo', 'Task 2');
    await addCard('in-progress', 'Task 3');

    const board = await loadBoard();
    expect(board.cards).toHaveLength(3);
    expect(board.cards.map((c) => c.id).sort()).toEqual(['task-1', 'task-2', 'task-3']);
  });
});
