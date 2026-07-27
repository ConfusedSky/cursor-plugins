# Orchestrate

Fan a large task out across parallel Cursor cloud agents via the Cursor SDK. Planners publish tasks, workers hand off back up, and a script reconciles the tree from disk and git, so the spawn / wait / handoff loop keeps converging without long-running agent state.

The skill itself lives in [`skills/orchestrate/SKILL.md`](./skills/orchestrate/SKILL.md). Read that for the full operating manual; this README only covers what to set up before you invoke it.

## Prerequisites

- `bun` on PATH.
- A Cursor API key in `CURSOR_API_KEY`.
- Optional Slack app and bot token if you want a Slack thread mirroring the run.

## Model configuration (optional)

The built-in `MODEL_CATALOG` is merged with environment config into an **effective catalog**. That merged catalog is what planners see when they set `tasks[].model`, what `bun cli.ts models` prints, and what supplies role defaults when `tasks[].model` is omitted. Use it to steer cost without editing the plugin.

### Role defaults

| Env var | Role |
| --- | --- |
| `ORCHESTRATE_MODEL_WORKER` | worker default |
| `ORCHESTRATE_MODEL_SUBPLANNER` | subplanner default |
| `ORCHESTRATE_MODEL_VERIFIER` | verifier default |
| `ORCHESTRATE_MODEL_ROOT` | kickoff `--model` default |

Each value may be a catalog slug (`composer-2-fast`), a bare model id (`composer-2.5`), or a JSON entry:

```bash
export ORCHESTRATE_MODEL_WORKER=composer-2-fast
export ORCHESTRATE_MODEL_SUBPLANNER='{"id":"composer-2.5","params":[{"id":"fast","value":"true"}]}'
```

Anything named this way joins the effective catalog, so planners can select it by slug and it resolves back to the full selection (params included). A JSON entry may also carry `slug`, `summary`, `use`, `speed`, and `strengths` — worth setting, since planners choose by the capability prose:

```bash
export ORCHESTRATE_MODEL_WORKER='{"slug":"house-worker","id":"composer-2.5","summary":"House worker model.","use":"Use for all bounded implementation work.","speed":"fast","strengths":["throughput"]}'
```

### Adding models

`ORCHESTRATE_MODEL_CATALOG` takes a JSON array of entries. Entries with an `id` define a model; entries with only a `slug` pull in a built-in by reference. `defaultFor` claims a role.

```bash
export ORCHESTRATE_MODEL_CATALOG='[
  {"id":"composer-2.5","summary":"Cheap, fast worker.","defaultFor":["worker"]},
  {"slug":"claude-opus-4-8","defaultFor":["subplanner","verifier"]}
]'
```

### Restricting the menu

`ORCHESTRATE_MODEL_CATALOG_MODE=env-only` drops the built-in catalog, so planners see exactly the models you list (built-ins can be pulled back in by slug). Every role needs a default in this mode; the CLI exits with a config error if one is missing.

```bash
export ORCHESTRATE_MODEL_CATALOG_MODE=env-only
export ORCHESTRATE_MODEL_CATALOG='[
  {"slug":"composer-2-fast","defaultFor":["worker"]},
  {"slug":"claude-opus-4-8","defaultFor":["subplanner","verifier"]}
]'
```

### Precedence and limits

1. Explicit `tasks[].model` in the plan
2. Role env var (`ORCHESTRATE_MODEL_<ROLE>`)
3. `defaultFor` on an `ORCHESTRATE_MODEL_CATALOG` entry
4. `defaultFor` in the built-in catalog

Run `bun cli.ts models` to see the effective catalog, and `bun cli.ts models --check` to probe every entry (including your env-defined ones) against `/v1/agents`.

Two caveats. This shapes what planners choose from, but a planner can still write any model id into `tasks[].model`, so it is guidance rather than a spend ceiling. And each spawned agent reads its own environment: set these as Cursor Cloud secrets for the repo so subplanners and workers inherit them, not just in the dispatcher's local shell.

## Cursor API key

1. Open [https://cursor.com/dashboard/integrations](https://cursor.com/dashboard/integrations).
2. Create a personal user API key. The value starts with `cursor_`.
3. Export it: `export CURSOR_API_KEY="cursor_..."`.

Team service-account keys (Team Settings → Service accounts) also work for both local and cloud runs. See the [`cursor-sdk` plugin](https://github.com/cursor/plugins/tree/main/cursor-sdk) for the full auth model.

## Slack app (optional)

Slack visibility is opt-in. When the token is unset, the script logs once and runs without Slack; correctness does not change. To enable it:

1. Create a Slack app at [https://api.slack.com/apps](https://api.slack.com/apps) → **From scratch**. Pick a name and a workspace.
2. Under **OAuth & Permissions** → **Bot Token Scopes**, add:

   | Scope | Why |
   | --- | --- |
   | `chat:write` | Post and edit messages. |
   | `chat:write.customize` | Set the bot username and icon on each post. |
   | `chat:write.public` | Post in public channels without inviting the bot first. |
   | `files:write` | Upload handoff artifacts to the run thread. |
   | `files:read` | Paired with `files:write` for the upload v2 flow. |
   | `reactions:read` | Watch the Andon `:rotating_light:` reaction on the kickoff message. |
   | `channels:history` | Read thread replies. Use `groups:history` instead if your run channel is private. |

   Optional but recommended:

   | Scope | Why |
   | --- | --- |
   | `users:read.email` | Resolve the dispatcher's first name from `git config user.email`. Without it, pass `--dispatcher-name` explicitly. |

3. **Install to Workspace** and copy the **Bot User OAuth Token** (`xoxb-...`).
4. Export it: `export SLACK_BOT_TOKEN="xoxb-..."`.
5. Invite the bot to the channel where you want runs to thread (`/invite @your-bot`). Public channels with `chat:write.public` skip this; private channels require the invite.
6. Grab the channel ID. In Slack: right-click the channel → **View channel details** → bottom of the dialog. Pass it via `--slack-channel <id>` on `kickoff` (or set `SLACK_CHANNEL_ID`). The first kickoff persists the id on the plan; subplanners and later `run` invocations inherit it.

## Install

```bash
cd skills/orchestrate/scripts
bun install
```

The scripts live outside the host repo's package manager workspace on purpose.

## Invoke

```bash
bun skills/orchestrate/scripts/cli.ts kickoff "<goal>" \
  [--repo <url>] [--ref main] [--model claude-opus-4-7] \
  [--slack-channel <id>] [--dispatcher-name "<first name>"]
```

The CLI prints `{ agentId, runId, status, url }`; from there the cloud root planner self-drives. See the skill for `run`, `spawn`, `respawn`, `kill`, `tail`, `comment`, and `andon` subcommands.

## License

MIT. See [`LICENSE`](./LICENSE).
