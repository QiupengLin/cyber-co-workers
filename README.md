# Cyber Co-workers

A local Mac desktop office for Codex and Claude Code: eight desks, persistent characters, live activity, city windows, day/night lighting, simulated weather, and a coffee corner. Built with a TypeScript backend, a Canvas frontend, and Electron.

See [ARCHITECTURE.md](ARCHITECTURE.md) for the system design, data flow, module responsibilities, and current limitations.

## Run

```sh
npm install
npm run build
npm start
```

`npm run dev` runs the desktop app with a Vite frontend. `npm run preview` is a browser-only **demo**, not live monitoring. The desktop starts in live mode; use **Explore demo** to see all character states with explicitly simulated sessions.

## Connect

Codex daemon metadata is polled read-only every two seconds. Desktop sessions using a separate private app-server are detected from **fresh structural events** in local Codex session logs. Start the office, then continue a Codex turn: the worker should appear. Already-idle desktop chats do not populate the office until fresh activity. Subagents do not occupy desks. Disconnected characters leave automatically after 30 seconds; they can return when live activity reconnects. Manual dismissal still hides a session for the remainder of the app run.

For permission descriptions and exact Warp pane links:

```sh
npm run connect
```

This adds our minimal event hooks to `~/.codex/hooks.json`, preserving existing entries and backing up an existing configuration. Review and trust the added definitions with `/hooks` in Codex. It does not grant trust itself. Details: [README-hooks.md](README-hooks.md).

Desktop navigation uses the documented chat deep link. Warp navigation requires a real `WARP_FOCUS_URL` captured by a hook; absence is shown explicitly. Shared-daemon environment propagation may prevent capture, so precise Warp focus is not guaranteed without testing in your terminal. Neither navigation nor monitoring sends prompts or answers approvals.

### Claude Code

```sh
npm run connect:claude
```

This merges local observation hooks into `~/.claude/settings.json` (or `$CLAUDE_CONFIG_DIR/settings.json`), preserves other settings and hooks, and backs up an existing file. Restart Claude Code and review the entries with `/hooks`, then start a turn. To preview the configuration without installing it, run `node scripts/print-hook-config.mjs claude`.

Claude Code sessions appear alongside Codex sessions with separate identities and provider labels. Hooks report working, idle, permission/input waiting, and session end. Subagent events are ignored. Claude prompts, responses, tool inputs, and notification text are never retained. Exact navigation is available only when a valid `WARP_FOCUS_URL` is provided to the hook; no Claude desktop deep link is assumed.

Claude monitoring is hook-only and local: it does not discover historical sessions or remote cloud sessions. After one minute without a hook event, a session becomes disconnected and leaves after the 30-second grace period. This also applies to quiet work and idle/waiting sessions; a fresh event brings the character back. An ended session can be resumed, while manual dismissal lasts until the office restarts.

## Current limitations

- Desktop fallback depends on internal log structure and recognizes explicit work/completion/input markers. It is not a complete official observation API. Quiet long-running work becomes disconnected after two minutes rather than falsely idle.
- Desktop fallback labels are project plus short session ID. Daemon-backed sessions use available thread names.
- Approval descriptions come from hooks; input questions may only have a generic waiting label.
- Character/desk assignments and dismissals persist during this app run, not across app restarts.
- Hook trust requires user review. No trust settings are bypassed.
- The local `.app` is unsigned; distribution/signing is outside this MVP.

## Verify and package

```sh
npm test
npm run build
npm run package
```

The package is written to `release/`. Tests cover state normalization, history/subagent filtering, fresh log discovery and completion, desk stability, navigation URL validation, and real hook subprocess-to-observer delivery. No paid model requests are made by the tests.

## Structure

- `src/main/observer.ts`: read-only daemon transport and rollout fallback
- `src/main/codex-rollouts.ts`: bounded fresh structural event reader
- `src/main/hooks.ts` and `scripts/codex-hook.mjs`: private minimal event spool
- `src/main/store.ts`: stable identities, desks, dismissals
- `src/main/navigation.ts`: restricted exact-session destinations
- `src/renderer/`: original procedural office and controls
- `src/shared/types.ts`: typed backend/UI contract

All monitoring stays local. The browser renderer has no Node access; desktop actions cross a narrow preload bridge. The app does not retain transcripts, tool arguments, or prompts. Optional hook files contain minimal status metadata and supplied approval descriptions.
