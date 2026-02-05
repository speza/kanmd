import fs from 'fs';
import { loadBoard } from './files.js';

const CLEAR_SCREEN = '\x1b[2J\x1b[H';

export async function watchBoard(kanbanDir: string, renderFn: () => Promise<void>): Promise<void> {
  const debounceMs = 100;
  let debounceTimer: NodeJS.Timeout | null = null;
  let isRendering = false;
  let pendingRender = false;

  const scheduleRender = () => {
    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }

    debounceTimer = setTimeout(async () => {
      if (isRendering) {
        pendingRender = true;
        return;
      }

      isRendering = true;
      try {
        process.stdout.write(CLEAR_SCREEN);
        const timestamp = new Date().toLocaleTimeString();
        console.log(`\x1b[2m[${timestamp}]\x1b[0m\n`);
        await renderFn();
      } catch (err) {
        console.error(`\x1b[31mError:\x1b[0m ${(err as Error).message}`);
      } finally {
        isRendering = false;
        if (pendingRender) {
          pendingRender = false;
          scheduleRender();
        }
      }
    }, debounceMs);
  };

  // Initial render
  process.stdout.write(CLEAR_SCREEN);
  console.log('\x1b[2mWatching for changes... (Ctrl+C to exit)\x1b[0m\n');
  await renderFn();

  // Set up file watcher
  let watcher: fs.FSWatcher;

  try {
    watcher = fs.watch(kanbanDir, { recursive: true }, (_eventType, filename) => {
      if (!filename) return;
      // Ignore temp files and non-relevant changes
      if (filename.endsWith('.tmp') || filename.startsWith('.')) {
        return;
      }
      // Only react to .md and .yaml file changes
      if (filename.endsWith('.md') || filename.endsWith('.yaml')) {
        scheduleRender();
      }
    });
  } catch {
    // Fallback to polling if fs.watch fails
    console.error(
      '\x1b[33mWarning: Native file watching unavailable, falling back to polling\x1b[0m'
    );
    return pollBoard(kanbanDir, renderFn);
  }

  // Handle graceful shutdown
  const cleanup = () => {
    if (debounceTimer) clearTimeout(debounceTimer);
    watcher.close();
    console.log('\n\x1b[2mStopped watching.\x1b[0m');
    process.exit(0);
  };

  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);

  // Handle watcher errors
  watcher.on('error', (err) => {
    console.error(`\x1b[31mWatch error:\x1b[0m ${err.message}`);
    console.error('Falling back to polling mode...');
    watcher.close();
    pollBoard(kanbanDir, renderFn);
  });

  // Keep process alive
  await new Promise(() => {});
}

async function pollBoard(_kanbanDir: string, renderFn: () => Promise<void>): Promise<void> {
  const pollIntervalMs = 1000;
  let lastState = '';

  const checkForChanges = async () => {
    try {
      const board = await loadBoard();
      const currentState = JSON.stringify(board);

      if (currentState !== lastState) {
        lastState = currentState;
        process.stdout.write(CLEAR_SCREEN);
        const timestamp = new Date().toLocaleTimeString();
        console.log(`\x1b[2m[${timestamp}] (polling mode)\x1b[0m\n`);
        await renderFn();
      }
    } catch {
      // Ignore transient errors during polling
    }
  };

  // Initial state capture
  try {
    const board = await loadBoard();
    lastState = JSON.stringify(board);
  } catch {
    // Will be handled on first poll
  }

  const intervalId = setInterval(checkForChanges, pollIntervalMs);

  const cleanup = () => {
    clearInterval(intervalId);
    console.log('\n\x1b[2mStopped watching.\x1b[0m');
    process.exit(0);
  };

  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);

  await new Promise(() => {});
}
