import { lstat, mkdir, readdir, readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { parseHookEvent, type HookSessionEvent } from '../../shared/hook-event';

export class HookObserver {
  private timer?: ReturnType<typeof setInterval>;
  private reading = false;
  private seen = new Map<string, number>();
  private active = false;
  constructor(private onEvent: (event: HookSessionEvent) => void, private directory = process.env.CYBER_CO_WORKERS_EVENT_DIR || join(homedir(), '.local', 'share', 'cyber-co-workers', 'events'), private onRouting?: (event: HookSessionEvent) => void) {}
  start(): void {
    if (this.active) return;
    this.active = true;
    void this.poll();
    this.timer = setInterval(() => void this.poll(), 700);
  }
  stop(): void { this.active = false; clearInterval(this.timer); this.timer = undefined; }
  private async poll(): Promise<void> {
    if (this.reading || !this.active) return;
    this.reading = true;
    try {
      await mkdir(this.directory, { recursive: true, mode: 0o700 });
      const directoryStat = await lstat(this.directory);
      if (!directoryStat.isDirectory() || directoryStat.isSymbolicLink() || (process.getuid && directoryStat.uid !== process.getuid()) || (directoryStat.mode & 0o077)) return;
      const files = (await readdir(this.directory)).filter(name => /^[a-f0-9]{64}\.json$/.test(name)).slice(0, 512);
      for (const file of files) {
        try {
          const path = join(this.directory, file);
          const stat = await lstat(path);
          if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 4096 || (process.getuid && stat.uid !== process.getuid())) continue;
          if (this.seen.get(file) === stat.mtimeMs) continue;
          this.seen.set(file, stat.mtimeMs);
          const event = parseHookEvent(JSON.parse(await readFile(path, 'utf8')));
          if (!event || event.updatedAt > Date.now() + 5000) continue;
          // Pane identity outlives a turn. Replaying activity does not: an old
          // working event must never override a currently idle daemon session.
          if (this.active) this.onRouting?.(event);
          if (this.active && event.updatedAt >= Date.now() - 60_000) this.onEvent(event);
        } catch { /* A concurrent hook write or bad file must not stop monitoring. */ }
      }
    } catch { /* Passive observer remains retryable when storage is unavailable. */ }
    finally { this.reading = false; }
  }
}
