import { loadBoard } from './files.js';

const CLEAR_SCREEN = '\x1b[2J\x1b[H';

export async function watchBoard(_kanbanDir: string, renderFn: () => Promise<void>): Promise<void> {
  const pollIntervalMs = 1000;
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
        console.log(`\x1b[2m[${timestamp}]\x1b[0m\n`);
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

  // Initial render
  process.stdout.write(CLEAR_SCREEN);
  console.log('\x1b[2mWatching for changes... (Ctrl+C to exit)\x1b[0m\n');
  await renderFn();

  // Capture initial state
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

  // Keep process alive
  await new Promise(() => {});
}
