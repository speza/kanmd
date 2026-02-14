import { tmpdir } from 'os';
import { join } from 'path';

process.env.KANMD_DIR = join(tmpdir(), 'kanmd-test');
