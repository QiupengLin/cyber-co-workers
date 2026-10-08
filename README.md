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

Codex daemon metadata is polled read-only every two seconds. Desktop sessions using a separate private app-server are detected from **fresh structural events** in local Codex session logs. Start the office, then continue a Codex turn: the worker should appear. Already-idle desktop chats do not populate the office until fresh activity. Subagents do not occupy desks. Once observed, characters keep their desk and last reported state until an explicit session-end event or manual dismissal. Silence and temporary monitoring failures do not remove them. Manual dismissal still hides a session for the remainder of the app run.

For permission descriptions and exact Warp pane links:

```sh
npm run connect
```

This adds our minimal event hooks to `~/.codex/hooks.json`, preserving existing entries and backing up an existing configuration. Review and trust the added definitions with `/hooks` in Codex. It does not grant trust itself. Details: [Codex and Claude Code hook reference](README-hooks.md).

Desktop navigation uses the documented chat deep link. Warp navigation requires a real `WARP_FOCUS_URL` captured by a hook; absence is shown explicitly. Shared-daemon environment propagation may prevent capture, so precise Warp focus is not guaranteed without testing in your terminal. Neither navigation nor monitoring sends prompts or answers approvals.

### Claude Code

```sh
npm run connect:claude
```

This merges local observation hooks into `~/.claude/settings.json` (or `$CLAUDE_CONFIG_DIR/settings.json`), preserves other settings and hooks, and backs up an existing file. Restart Claude Code and review the entries with `/hooks`, then start a turn. To preview the configuration without installing it, run `node scripts/print-hook-config.mjs claude`.

Claude Code sessions appear alongside Codex sessions with separate identities and provider labels. Hooks report working, idle, permission/input waiting, and session end. Subagent events are ignored. Claude prompts, responses, tool inputs, and notification text are never retained. Exact navigation is available only when a valid `WARP_FOCUS_URL` is provided to the hook; no Claude desktop deep link is assumed.

Claude monitoring is hook-only and local: it does not discover historical sessions or remote cloud sessions. Once observed during this app run, a session stays in the office without an inactivity timeout. Its last reported state is retained until new activity or an explicit session-end event. An ended session can be resumed, while manual dismissal lasts until the office restarts.

## Current limitations

- Desktop fallback depends on internal log structure and recognizes explicit work/completion/input markers. It is not a complete official observation API. Quiet sessions retain their last reported state; silence does not imply completion or closure.
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

```text
src/
  app/            Electron lifecycle, IPC handlers, and preload bridge
  integrations/   External observation adapters
    codex/        Daemon transport, log reader, and normalization
    hooks/        Hook event spool observer for Codex and Claude
  office/         Session merging, desks, dismissal, navigation, demo data
  renderer/       Canvas office, controls, styling, character movement
  shared/         Session/IPC types and validated hook event contract
scripts/
  dev/            Development app launcher
  *-hook.mjs      Stable executable paths for installed hook registrations
  install-hooks.mjs / print-hook-config.mjs   Hook setup commands
  test.mjs        Recursive test discovery and runner
tests/
  integration/    Hook delivery and navigation recovery across modules
```

Unit tests live beside their implementation. Tests spanning multiple modules live in
`tests/integration/`. `npm test` discovers nested tests automatically.

Start with `src/app/index.ts` to follow application wiring. Add provider observation
under `src/integrations/`, office behavior under `src/office/`, and visual behavior
under `src/renderer/`. See [architecture ownership rules](ARCHITECTURE.md#modules-and-ownership)
for dependency direction and extension guidance.

All monitoring stays local. The browser renderer has no Node access; desktop actions cross a narrow preload bridge. The app does not retain transcripts, tool arguments, or prompts. Optional hook files contain minimal status metadata and supplied approval descriptions.
