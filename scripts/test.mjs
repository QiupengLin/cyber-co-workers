import { readdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const tests = (await Promise.all(['src', 'scripts', 'tests'].map(async directory =>
  (await readdir(new URL(`../${directory}/`, import.meta.url), { recursive: true }))
    .filter(file => /\.test\.(ts|mjs)$/.test(file))
    .map(file => `${directory}/${file}`)
))).flat().sort();
if (!tests.length) throw new Error('No tests found');
const result = spawnSync(process.execPath, ['--import', 'tsx', '--test', ...tests], {
  cwd: root,
  stdio: 'inherit',
});
if (result.error) throw result.error;
process.exit(result.status ?? 1);
