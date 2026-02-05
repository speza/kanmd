import fs from 'fs';
import { loadBoard } from './files.js';

const CLEAR_SCREEN = '\x1b[2J\x1b[H';

export async function watchBoard(kanbanDir: string, renderFn: () => Promise<void>): Promise<void> {
  const debounceMs = 100;
  const pollIntervalMs = 1000;
  let debounceTimer: NodeJS.Timeout | null = null;
  let pollIntervalId: NodeJS.Timeout | null = null;
  let watcher: fs.FSWatcher | null = null;
  let isRendering = false;
  let pendingRender = false;

  // Cleanup function - updated when switching modes
  let cleanupFn = () => {};

  const cleanup = () => {
    cleanupFn();
    console.log('\n\x1b[2mStopped watching.\x1b[0m');
    process.exit(0);
  };

  // Register signal handlers once
  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);

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

  const startPolling = () => {
    let lastState = '';
    let consecutiveErrors = 0;

    const checkForChanges = async () => {
      try {
        const board = await loadBoard();
        const currentState = JSON.stringify(board);
        consecutiveErrors = 0;

        if (currentState !== lastState) {
          lastState = currentState;
          process.stdout.write(CLEAR_SCREEN);
          const timestamp = new Date().toLocaleTimeString();
          console.log(`\x1b[2m[${timestamp}] (polling mode)\x1b[0m\n`);
          await renderFn();
        }
      } catch (err) {
        consecutiveErrors++;
        if (consecutiveErrors >= 3) {
          console.error(`\x1b[31mError:\x1b[0m ${(err as Error).message}`);
          consecutiveErrors = 0;
        }
      }
    };

    // Capture initial state
    loadBoard()
      .then((board) => {
        lastState = JSON.stringify(board);
      })
      .catch(() => {
        // Will be handled on first poll
      });

    pollIntervalId = setInterval(checkForChanges, pollIntervalMs);

    cleanupFn = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      if (pollIntervalId) clearInterval(pollIntervalId);
    };
  };

  // Initial render
  process.stdout.write(CLEAR_SCREEN);
  console.log('\x1b[2mWatching for changes... (Ctrl+C to exit)\x1b[0m\n');
  await renderFn();

  // Try native file watching first
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

    cleanupFn = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      if (watcher) watcher.close();
    };

    // Handle watcher errors by switching to polling
    watcher.on('error', (err) => {
      console.error(`\x1b[31mWatch error:\x1b[0m ${err.message}`);
      console.error('Falling back to polling mode...');
      if (watcher) {
        watcher.close();
        watcher = null;
      }
      startPolling();
    });
  } catch {
    // Fallback to polling if fs.watch fails
    console.error(
      '\x1b[33mWarning: Native file watching unavailable, falling back to polling\x1b[0m'
    );
    startPolling();
  }

  // Keep process alive
  await new Promise(() => {});
}
