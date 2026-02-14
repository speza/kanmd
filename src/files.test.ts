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
  rankCard,
  checklistAdd,
  checklistToggle,
  checklistRemove,
} from './files.js';
import { KanmdError } from './types.js';

const KANBAN_DIR = path.join(process.cwd(), '.kanmd');

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

  test('parses full ISO timestamp for created', () => {
    const markdown = `---
priority: high
labels:
created: 2024-01-15T10:30:00.000Z
---

# Title`;

    const result = parseFrontmatter(markdown);
    expect(result.frontmatter.created).toBe('2024-01-15T10:30:00.000Z');
  });

  test('parses updated timestamp', () => {
    const markdown = `---
priority: medium
labels:
created: 2024-01-15T10:30:00.000Z
updated: 2024-01-16T14:45:00.000Z
---

# Title`;

    const result = parseFrontmatter(markdown);
    expect(result.frontmatter.updated).toBe('2024-01-16T14:45:00.000Z');
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

  test('parses rank from frontmatter', () => {
    const markdown = `---
priority: high
labels:
created: 2024-01-15
rank: 3
---

# Title`;

    const result = parseFrontmatter(markdown);
    expect(result.frontmatter.rank).toBe(3);
  });

  test('handles missing rank', () => {
    const markdown = `---
priority: medium
labels:
---

# Title`;

    const result = parseFrontmatter(markdown);
    expect(result.frontmatter.rank).toBeUndefined();
  });

  test('handles invalid rank value', () => {
    const markdown = `---
rank: not-a-number
---

# Title`;

    const result = parseFrontmatter(markdown);
    expect(result.frontmatter.rank).toBeUndefined();
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
    expect(card.updated).toBeUndefined();
    expect(card.description).toBe('');
    expect(card.checklist).toEqual([]);
    expect(card.rank).toBeUndefined();
  });

  test('parses updated timestamp', () => {
    const markdown = `---
priority: medium
labels:
created: 2024-01-15T10:30:00.000Z
updated: 2024-01-16T14:45:00.000Z
---

# My Card`;

    const card = parseCard(markdown, 'my-card.md', 'todo');
    expect(card.updated).toBe('2024-01-16T14:45:00.000Z');
  });

  test('parses rank from card', () => {
    const markdown = `---
priority: high
labels:
created: 2024-01-15
rank: 2
---

# My Card`;

    const card = parseCard(markdown, 'my-card.md', 'todo');
    expect(card.rank).toBe(2);
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
    expect(serialized).not.toContain('rank:');
  });

  test('serializes rank when present', () => {
    const card = {
      title: 'Ranked Card',
      priority: 'high' as const,
      labels: [],
      created: '2024-01-15',
      rank: 5,
    };

    const serialized = serializeCard(card);
    expect(serialized).toContain('rank: 5');
  });

  test('does not serialize rank when undefined', () => {
    const card = {
      title: 'Unranked Card',
      priority: 'medium' as const,
      labels: [],
      created: '2024-01-15',
      rank: undefined,
    };

    const serialized = serializeCard(card);
    expect(serialized).not.toContain('rank:');
  });

  test('serializes updated timestamp when present', () => {
    const card = {
      title: 'Updated Card',
      priority: 'medium' as const,
      labels: [],
      created: '2024-01-15T10:30:00.000Z',
      updated: '2024-01-16T14:45:00.000Z',
    };

    const serialized = serializeCard(card);
    expect(serialized).toContain('updated: 2024-01-16T14:45:00.000Z');
  });

  test('does not serialize updated when undefined', () => {
    const card = {
      title: 'New Card',
      priority: 'medium' as const,
      labels: [],
      created: '2024-01-15T10:30:00.000Z',
    };

    const serialized = serializeCard(card);
    expect(serialized).not.toContain('updated:');
  });

  test('generates full ISO timestamp for created when not provided', () => {
    const card = {
      title: 'New Card',
    };

    const serialized = serializeCard(card);
    // Should contain a full ISO timestamp (with T and Z)
    const createdMatch = serialized.match(/created: (.+)/);
    expect(createdMatch).toBeTruthy();
    expect(createdMatch![1]).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });

  test('round-trips card with rank correctly', () => {
    const original = {
      id: 'ranked-card',
      title: 'Ranked Card',
      priority: 'high' as const,
      labels: [],
      created: '2024-01-15',
      description: '',
      checklist: [],
      column: 'todo',
      rank: 3,
    };

    const serialized = serializeCard(original);
    const parsed = parseCard(serialized, 'ranked-card.md', 'todo');

    expect(parsed.rank).toBe(3);
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

describe('rankCard', () => {
  beforeEach(setupTestBoard);
  afterEach(cleanupTestBoard);

  test('ranks a single card', async () => {
    await addCard('todo', 'Task A');
    await rankCard('task-a', 1);

    const card = await getCard('task-a');
    expect(card.rank).toBe(1);
  });

  test('moves card to first position', async () => {
    await addCard('todo', 'Task A');
    await addCard('todo', 'Task B');
    await addCard('todo', 'Task C');

    // Rank Task C to position 1
    await rankCard('task-c', 1);

    const board = await loadBoard();
    const todoCards = board.cards.filter((c) => c.column === 'todo');

    const cardA = todoCards.find((c) => c.id === 'task-a');
    const cardB = todoCards.find((c) => c.id === 'task-b');
    const cardC = todoCards.find((c) => c.id === 'task-c');

    expect(cardC?.rank).toBe(1);
    expect(cardA?.rank).toBe(2);
    expect(cardB?.rank).toBe(3);
  });

  test('moves card to middle position', async () => {
    await addCard('todo', 'Task A');
    await addCard('todo', 'Task B');
    await addCard('todo', 'Task C');

    // First rank them all
    await rankCard('task-a', 1);
    await rankCard('task-b', 2);
    await rankCard('task-c', 3);

    // Now move C to position 2
    await rankCard('task-c', 2);

    const board = await loadBoard();
    const todoCards = board.cards.filter((c) => c.column === 'todo');

    const cardA = todoCards.find((c) => c.id === 'task-a');
    const cardB = todoCards.find((c) => c.id === 'task-b');
    const cardC = todoCards.find((c) => c.id === 'task-c');

    expect(cardA?.rank).toBe(1);
    expect(cardC?.rank).toBe(2);
    expect(cardB?.rank).toBe(3);
  });

  test('handles position beyond card count', async () => {
    await addCard('todo', 'Task A');
    await addCard('todo', 'Task B');

    // Rank to position 10 (should end up at position 2)
    await rankCard('task-a', 10);

    const board = await loadBoard();
    const cardA = board.cards.find((c) => c.id === 'task-a');
    const cardB = board.cards.find((c) => c.id === 'task-b');

    expect(cardB?.rank).toBe(1);
    expect(cardA?.rank).toBe(2);
  });

  test('rejects invalid position', async () => {
    await addCard('todo', 'Task A');
    await expect(rankCard('task-a', 0)).rejects.toThrow('Position must be 1 or greater');
    await expect(rankCard('task-a', -1)).rejects.toThrow('Position must be 1 or greater');
  });

  test('rejects nonexistent card', async () => {
    await expect(rankCard('nonexistent', 1)).rejects.toThrow('not found');
  });

  test('only ranks cards in same priority group', async () => {
    await addCard('todo', 'High Task', 'high');
    await addCard('todo', 'Medium Task', 'medium');

    await rankCard('high-task', 1);
    await rankCard('medium-task', 1);

    const board = await loadBoard();
    const highTask = board.cards.find((c) => c.id === 'high-task');
    const mediumTask = board.cards.find((c) => c.id === 'medium-task');

    // Each should be rank 1 in their own priority group
    expect(highTask?.rank).toBe(1);
    expect(mediumTask?.rank).toBe(1);
  });
});

describe('moveCard clears rank', () => {
  beforeEach(setupTestBoard);
  afterEach(cleanupTestBoard);

  test('clears rank when moving to different column', async () => {
    await addCard('todo', 'Task A');
    await rankCard('task-a', 1);

    // Verify rank is set
    let card = await getCard('task-a');
    expect(card.rank).toBe(1);

    // Move to different column
    await moveCard('task-a', 'in-progress');

    // Rank should be cleared
    card = await getCard('task-a');
    expect(card.rank).toBeUndefined();
  });
});

describe('editCard clears rank on priority change', () => {
  beforeEach(setupTestBoard);
  afterEach(cleanupTestBoard);

  test('can clear rank via editCard', async () => {
    await addCard('todo', 'Task A');
    await rankCard('task-a', 1);

    // Verify rank is set
    let card = await getCard('task-a');
    expect(card.rank).toBe(1);

    // Clear rank by setting to undefined
    await editCard('task-a', { rank: undefined });

    card = await getCard('task-a');
    expect(card.rank).toBeUndefined();
  });
});

describe('timestamp behavior', () => {
  beforeEach(setupTestBoard);
  afterEach(cleanupTestBoard);

  test('addCard creates full ISO timestamp', async () => {
    const card = await addCard('todo', 'New Task');
    // Should be full ISO timestamp format
    expect(card.created).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });

  test('editCard sets updated timestamp', async () => {
    await addCard('todo', 'Task A');

    // Initially no updated timestamp
    let card = await getCard('task-a');
    expect(card.updated).toBeUndefined();

    await editCard('task-a', { title: 'Updated Title' });

    card = await getCard('task-a');
    expect(card.updated).toBeTruthy();
    expect(card.updated).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });

  test('moveCard sets updated timestamp', async () => {
    await addCard('todo', 'Task A');

    // Initially no updated timestamp
    let card = await getCard('task-a');
    expect(card.updated).toBeUndefined();

    await moveCard('task-a', 'in-progress');

    card = await getCard('task-a');
    expect(card.updated).toBeTruthy();
    expect(card.updated).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });

  test('rankCard sets updated timestamp', async () => {
    await addCard('todo', 'Task A');
    await addCard('todo', 'Task B');

    // Initially no updated timestamp
    let card = await getCard('task-a');
    expect(card.updated).toBeUndefined();

    await rankCard('task-a', 1);

    card = await getCard('task-a');
    expect(card.updated).toBeTruthy();
    expect(card.updated).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });
});

describe('checklistAdd', () => {
  beforeEach(setupTestBoard);
  afterEach(cleanupTestBoard);

  test('adds item to empty checklist', async () => {
    await addCard('todo', 'Task A');
    const card = await checklistAdd('task-a', 'First item');

    expect(card.checklist).toHaveLength(1);
    expect(card.checklist[0]).toEqual({ text: 'First item', checked: false });
  });

  test('appends item to existing checklist', async () => {
    await addCard('todo', 'Task A');
    await checklistAdd('task-a', 'First item');
    const card = await checklistAdd('task-a', 'Second item');

    expect(card.checklist).toHaveLength(2);
    expect(card.checklist[0].text).toBe('First item');
    expect(card.checklist[1].text).toBe('Second item');
  });

  test('persists to disk', async () => {
    await addCard('todo', 'Task A');
    await checklistAdd('task-a', 'Persisted item');

    const card = await getCard('task-a');
    expect(card.checklist).toHaveLength(1);
    expect(card.checklist[0].text).toBe('Persisted item');
  });

  test('sets updated timestamp', async () => {
    await addCard('todo', 'Task A');
    const card = await checklistAdd('task-a', 'New item');

    expect(card.updated).toBeTruthy();
    expect(card.updated).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });

  test('rejects nonexistent card', async () => {
    await expect(checklistAdd('nonexistent', 'Item')).rejects.toThrow('not found');
  });

  test('rejects invalid card ID', async () => {
    await expect(checklistAdd('../etc', 'Item')).rejects.toThrow(KanmdError);
  });
});

describe('checklistToggle', () => {
  beforeEach(setupTestBoard);
  afterEach(cleanupTestBoard);

  test('toggles unchecked item to checked', async () => {
    await addCard('todo', 'Task A');
    await checklistAdd('task-a', 'Toggle me');

    const card = await checklistToggle('task-a', 1);
    expect(card.checklist[0].checked).toBe(true);
  });

  test('toggles checked item to unchecked', async () => {
    await addCard('todo', 'Task A');
    await checklistAdd('task-a', 'Toggle me');
    await checklistToggle('task-a', 1);

    const card = await checklistToggle('task-a', 1);
    expect(card.checklist[0].checked).toBe(false);
  });

  test('persists to disk', async () => {
    await addCard('todo', 'Task A');
    await checklistAdd('task-a', 'Check me');
    await checklistToggle('task-a', 1);

    const card = await getCard('task-a');
    expect(card.checklist[0].checked).toBe(true);
  });

  test('rejects index out of range (too high)', async () => {
    await addCard('todo', 'Task A');
    await checklistAdd('task-a', 'Only item');

    await expect(checklistToggle('task-a', 2)).rejects.toThrow('out of range');
  });

  test('rejects index out of range (zero)', async () => {
    await addCard('todo', 'Task A');
    await checklistAdd('task-a', 'Only item');

    await expect(checklistToggle('task-a', 0)).rejects.toThrow('out of range');
  });

  test('rejects nonexistent card', async () => {
    await expect(checklistToggle('nonexistent', 1)).rejects.toThrow('not found');
  });

  test('sets updated timestamp', async () => {
    await addCard('todo', 'Task A');
    await checklistAdd('task-a', 'Item');
    const card = await checklistToggle('task-a', 1);

    expect(card.updated).toBeTruthy();
    expect(card.updated).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });
});

describe('checklistRemove', () => {
  beforeEach(setupTestBoard);
  afterEach(cleanupTestBoard);

  test('removes item by index', async () => {
    await addCard('todo', 'Task A');
    await checklistAdd('task-a', 'First');
    await checklistAdd('task-a', 'Second');
    await checklistAdd('task-a', 'Third');

    const card = await checklistRemove('task-a', 2);
    expect(card.checklist).toHaveLength(2);
    expect(card.checklist[0].text).toBe('First');
    expect(card.checklist[1].text).toBe('Third');
  });

  test('removes first item', async () => {
    await addCard('todo', 'Task A');
    await checklistAdd('task-a', 'First');
    await checklistAdd('task-a', 'Second');

    const card = await checklistRemove('task-a', 1);
    expect(card.checklist).toHaveLength(1);
    expect(card.checklist[0].text).toBe('Second');
  });

  test('removes last item', async () => {
    await addCard('todo', 'Task A');
    await checklistAdd('task-a', 'First');
    await checklistAdd('task-a', 'Second');

    const card = await checklistRemove('task-a', 2);
    expect(card.checklist).toHaveLength(1);
    expect(card.checklist[0].text).toBe('First');
  });

  test('persists to disk', async () => {
    await addCard('todo', 'Task A');
    await checklistAdd('task-a', 'Keep');
    await checklistAdd('task-a', 'Remove');
    await checklistRemove('task-a', 2);

    const card = await getCard('task-a');
    expect(card.checklist).toHaveLength(1);
    expect(card.checklist[0].text).toBe('Keep');
  });

  test('rejects index out of range', async () => {
    await addCard('todo', 'Task A');
    await checklistAdd('task-a', 'Only item');

    await expect(checklistRemove('task-a', 2)).rejects.toThrow('out of range');
  });

  test('rejects nonexistent card', async () => {
    await expect(checklistRemove('nonexistent', 1)).rejects.toThrow('not found');
  });

  test('sets updated timestamp', async () => {
    await addCard('todo', 'Task A');
    await checklistAdd('task-a', 'Item');
    const card = await checklistRemove('task-a', 1);

    expect(card.updated).toBeTruthy();
    expect(card.updated).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });
});
