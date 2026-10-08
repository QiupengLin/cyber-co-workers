# Optional Codex hook supplement

The app's primary session monitor does not require hooks. This supplement can add lifecycle events and capture the originating Warp pane when Codex passes Warp's environment to its hooks. It does not run Codex, change permissions, approve requests, or read a transcript.

## Setup

1. Review `scripts/codex-hook.mjs`. From this project run `node scripts/print-hook-config.mjs` to print a configuration with absolute script and Node paths.
2. Merge the printed `hooks` entries into your existing `~/.codex/hooks.json` (or `$CODEX_HOME/hooks.json` if customized). Preserve all existing hooks. If the file does not exist, the printed object is the entire file. No installer has edited your config.
3. In Codex CLI, use `/hooks` to review and trust the new definitions, then start or resume a session. Codex deliberately skips new or changed untrusted hooks. Do not bypass hook trust. Desktop hook support depends on the installed version and its hook configuration/trust UI; the primary observer is independent of that.
4. In a Warp shell, `printenv WARP_FOCUS_URL` should show a `warp://session/` link. The hook preserves that exact link if it has a valid 32-digit hex session ID. It also supports Warp Preview links. It never constructs a link from a guessed terminal ID.

After setup, launching Codex normally continues to work. Existing sessions may need a resume/restart before new hook configuration is loaded. Node must remain installed at the printed absolute path.

## Limits

Codex's shared background daemon may not pass a particular terminal's Warp environment to hook subprocesses. A missing Warp link means exact-pane focus is unavailable; it must not be treated as successful navigation. Session metadata from the primary observer should remain authoritative for distinguishing desktop from CLI. The hook marks source as `cli` only when it receives a valid Warp focus link; otherwise it reports `unknown`.

`PermissionRequest` reports the optional human-readable `tool_input.description`, stripped of control characters and capped at 240 characters, or “Waiting for permission in Codex.” All other tool arguments, prompts, and transcripts are discarded. Requests for user input that are not permission requests must come from the primary live observer. Subagent start/stop events are omitted so a subagent cannot create a separate desk or mark its parent idle. Parent-scoped tool events may still reflect a subagent's activity, so live observer state takes priority.

The hook writes only session ID, state, timestamp, project basename, optional Warp focus link, and an explicit session-end marker. Files are private (directory 0700, files 0600) under `~/.local/share/cyber-co-workers/events`. One atomically replaced file per session bounds per-session growth. The app rejects malformed/oversized files and events older than one minute so stale historical conversations do not populate the room. Old files can be deleted when the app is stopped. Set `CYBER_CO_WORKERS_EVENT_DIR` consistently for hook and app only if you need a different private directory.

The hook has a 1.2-second internal deadline, a 1 MiB input cap, and always exits without denying a Codex action. It performs no network requests. The generated Codex timeout is two seconds.

## Verification

Run `node --test scripts/codex-hook.test.mjs`. Real Warp pane focus still requires a live CLI session from your terminal; a synthetic test cannot verify desktop navigation.

## Sources

- [Official Codex hooks documentation](https://learn.chatgpt.com/docs/hooks): current input schema, events, configuration, and `/hooks` trust flow.
- [Warp upstream focus environment implementation](https://github.com/warpdotdev/warp/pull/11130/files): `WARP_FOCUS_URL`, `WARP_TERMINAL_SESSION_UUID`, and the session URL format.
- [Warp 2026 changelog](https://docs.warp.dev/changelog/2026/): release announcement for terminal focus URL environment variables.

## Claude Code

Run `npm run connect:claude` to install the Claude adapter, or `node scripts/print-hook-config.mjs claude` to inspect its configuration first. The target is `~/.claude/settings.json`, with `CLAUDE_CONFIG_DIR` supported for a custom directory. Existing settings and hooks are preserved and backed up; repeated installs do not duplicate commands. Restart Claude Code after installation and inspect `/hooks`.

The adapter uses the [official Claude Code hook contract](https://code.claude.com/docs/en/hooks): lifecycle and tool events report activity; `PermissionRequest`, `AskUserQuestion`, and elicitation events report waiting. Selected notifications provide permission/input and idle fallback signals. `StopFailure` reports an idle session after a failed turn; `PostToolUseFailure` reports continued work. Subagent events carrying `agent_id` are ignored. Every hook exits without policy decisions or stdout; it cannot approve, deny, or inject context.

Claude IDs use a `claude:` namespace in the shared private spool. The hook retains only status, time, project basename, provider, a generic waiting label, and an optional exact Warp link. It does not read transcripts or retain prompt, tool-input, response, or notification content. Hook activity expires after 60 seconds; disconnected occupants leave after 30 more seconds and return on fresh activity unless manually dismissed. Remote hooks cannot reach this local spool.
