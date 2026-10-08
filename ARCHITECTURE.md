# Cyber Co-workers architecture

Cyber Co-workers is a local Mac desktop application that represents Codex desktop and CLI sessions as characters in an animated office. Each top-level session owns a character and desk. Session monitoring supplies factual activity; the renderer uses that activity to choose poses and movement while independently animating the room.

This document describes the current implementation. Setup commands are in [README.md](README.md); hook installation and trust are explained in [README-hooks.md](README-hooks.md).

## System overview

```mermaid
flowchart TD
    Daemon[Codex local daemon] -->|WebSocket over Unix socket| Observer[CodexObserver]
    Logs[Local Codex session logs] -->|Fresh structural events| Rollouts[RolloutObserver]
    Rollouts --> Observer
    Codex[Trusted Codex lifecycle hooks] --> Shim[Hook script]
    Shim -->|Atomic JSON files| Spool[Private event directory]
    Spool --> Hooks[HookObserver]
    Observer --> Main[Electron main: merge observations]
    Hooks --> Main
    Main --> Store[OfficeStore]
    Store -->|OfficeSnapshot| Bridge[Preload IPC bridge]
    Bridge --> UI[Canvas scene and HTML controls]
    Clock[Local clock and simulated weather] --> UI
    UI -->|Focus session ID| Bridge
    Bridge --> Navigation[Validate destination in main process]
    Navigation -->|Desktop chat or Warp pane link| Original[Original session]
```

There is no hosted backend. Observation, normalization, and desktop navigation run in Electron's main process. Drawing and interaction run in the renderer process. A narrow preload bridge connects them.

## Modules and ownership

| Module | Responsibility |
| --- | --- |
| `src/main/index.ts` | Application lifecycle, window creation, IPC handlers, observation merging, live/demo selection |
| `src/main/observer.ts` | Connect to the existing Codex daemon, poll loaded sessions, reconnect, merge daemon and log observations |
| `src/main/codex-state.ts` | Normalize daemon metadata into the shared session model |
| `src/main/codex-rollouts.ts` | Read fresh structural events from local session logs when direct live metadata is unavailable |
| `src/main/hooks.ts` | Validate and consume minimal hook events from a private directory |
| `src/main/store.ts` | Retain sessions, allocate stable desks, preserve navigation links, and honor dismissals |
| `src/main/navigation.ts` | Select and validate an exact-session destination |
| `src/main/preload.ts` | Expose the limited `window.office` API to the renderer |
| `src/shared/types.ts` | Define the session, snapshot, and IPC API contracts |
| `src/renderer/main.ts` | Canvas artwork, character animation, scene hit testing, roster, overflow, and tooltips |
| `src/renderer/style.css` | Window layout, responsive sizing, controls, and status styling |
| `scripts/codex-hook.mjs` | Convert hook input into a bounded status event without retaining prompts or tool commands |
| `scripts/install-hooks.mjs` | Merge hook definitions into Codex configuration, backing up an existing configuration |

## Observation sources

### Codex daemon

`CodexObserver` connects to the existing control socket using the `ws` library. The default socket is under `~/.codex/app-server-control/`; `CODEX_HOME` and `CYBER_CODEX_SOCKET` can override the relevant locations.

The observer initializes a metadata client and polls `thread/loaded/list`, followed by `thread/read` with `includeTurns: false`, every two seconds. It enumerates loaded sessions rather than historical conversations. It does not start or resume threads, submit prompts, answer approvals, or respond to unsolicited server requests.

Daemon metadata supplies available thread names, working directories, and runtime status. Parent/subagent metadata excludes subagents from the desk roster. Lost connections mark observed daemon sessions disconnected and trigger reconnection after five seconds.

### Fresh local session events

Some desktop sessions use a separate private app-server, so they are not visible through the shared CLI daemon. `RolloutObserver` provides a best-effort fallback by reading session files under the Codex home directory.

Admission requires fresh structural activity timestamped after the observer started. Old conversations do not appear merely because their files exist. The reader uses session metadata to identify the session and its origin, filters out subagents, and recognizes explicit work, completion, interruption, and input-request markers. Matching call IDs keep unrelated tool outputs from clearing an outstanding input request.

Reading is bounded: the initial activity tail is at most 256 KiB, and subsequent reads are at most 1 MiB per file per poll. Prompts and outputs may be present in the bytes read, but their contents are not stored in the application model or sent to the renderer. Fallback labels use the project name and a short session ID.

A working session with no structural signal for two minutes becomes disconnected. Silence does not imply completion. This fallback depends on internal log formats and cannot guarantee detection of every approval or input state.

### Lifecycle hooks

Trusted Codex hooks invoke `scripts/codex-hook.mjs`. The script normalizes stdin JSON and writes one atomically replaced event file per session to:

```text
~/.local/share/cyber-co-workers/events/
```

`CYBER_CO_WORKERS_EVENT_DIR` can override that directory. The directory is private, files are created with owner-only permissions, and filenames are hashes of session IDs.

Events contain a session ID, status, timestamp, project basename, and optional validated Warp focus URL. Permission events can include a sanitized approval description capped at 240 characters. Full prompts, tool commands, and tool argument objects are discarded. The script has an input cap and deadline and does not return an approval decision.

`HookObserver` checks for changes every 700 milliseconds, validates file ownership and shape, and rejects oversized, stale, or excessively future-dated events. Hook installation preserves existing configuration. Trust remains a separate action in Codex; the installer does not grant it.

## Shared state and merging

`WorkerSession` contains:

- Identity: `id`, `title`, `project`, and `source` (`desktop`, `cli`, or `unknown`).
- Activity: `status`, optional `detail`, and `updatedAt`.
- Presentation/navigation: `desk` and optional `focusUrl`.

`OfficeSnapshot` carries the session list, overall connection indicator, explanatory message, and explicit demo flag.

| Status | Meaning | Office behavior |
| --- | --- | --- |
| `working` | An observed active state or work event | Character works at its desk |
| `idle` | An explicit idle state or completed/interrupted turn | Character remains present and can wander |
| `waiting` | An observed approval or user-input request | Character shows a question mark |
| `disconnected` | Current state cannot be established | Character remains with a distinct indicator |

Observations are deduplicated by session ID. A live daemon record takes precedence over the log fallback; a disconnected daemon record does not replace an available log record. Main-process merging preserves hook-provided Warp links and CLI identity. Recent hook state can fill a disconnected observation or keep a hook-only session present for up to one minute. Hook callbacks publish immediately; subsequent live observations may replace their activity details.

`OfficeStore` assigns the first available desk and retains that assignment across polling order changes. Missing observations become disconnected rather than disappearing. Explicit dismissal and hook-reported session end remove an occupant and prevent its readmission for the remainder of the app run. These assignments and dismissals are in memory, not persisted across restarts.

## Desktop boundary and navigation

The renderer has no direct Node.js access. Electron enables sandboxing and context isolation, and the preload exposes only:

```text
getSnapshot()
onSnapshot(callback)
focusSession(id)
dismissSession(id)
setDemo(enabled)
```

The main process handles these requests and publishes `office:changed` snapshots. Clicking a character sends a session ID, not an arbitrary command or URL.

Navigation validates destinations before using Electron's `shell.openExternal`:

- Desktop sessions use `codex://threads/<thread-id>`.
- CLI sessions use the exact captured `warp://session/<32-hex-id>` or Warp Preview equivalent.
- Missing or unidentified destinations return an explanation to the UI.

A Warp pane ID is never guessed from a Codex thread ID. Whether Codex passes the originating Warp environment into a hook determines whether that pane link can be captured. Opening a URL successfully does not independently prove that the destination app selected the intended pane.

## Office rendering

The renderer draws original procedural pixel art with Canvas 2D. HTML/CSS provide the surrounding controls, accessible session buttons, tooltips, and overflow picker. Eight visible desks occupy a fixed four-by-two layout. Extra sessions remain in the snapshot and can be brought into the room through overflow selection.

Session updates and animation have separate cadences. Snapshot changes update factual state; `requestAnimationFrame` paints at approximately 30 frames per second. Animation pauses while the document is hidden. Roster buttons remain intact when displayed fields have not changed, preserving keyboard focus and accessibility targets.

The Mac's local time drives the displayed clock and day/night sky. Weather is a local selection between clear, cloudy, and rain. Neither weather nor decorative movement changes the underlying session status.

Demo mode supplies explicitly simulated workers. A browser-only preview has no Electron preload and therefore uses a labeled demo. The desktop app defaults to live monitoring. Demo characters cannot open or dismiss real sessions.

## Build and verification

Vite builds the renderer into `dist/renderer`. TypeScript checks all source files, and esbuild bundles the Electron main process and preload into `dist/main`. Electron Packager produces the Mac application under `release/`. The local package is unsigned.

`npm test` covers status normalization, historical/subagent filtering, fresh log discovery and completion, stable desks, dismissal, URL validation, and the hook subprocess-to-file-to-observer path. These tests do not make model requests. Live integration checks are still needed when Codex or Warp changes its protocol, log format, hook behavior, or URL handling.
