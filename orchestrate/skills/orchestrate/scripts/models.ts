import type { ModelSelection } from "@cursor/sdk";

import type { TaskType } from "./adapters/types.ts";

// Model catalog. Source of truth for `tasks[].model` choices; `defaultFor`
// entries supply the fallback when `tasks[].model` is omitted. Per-role env
// vars (see MODEL_ENV_BY_TYPE) override those catalog defaults at runtime.

export interface ModelProfile {
  /** User-facing slug for `tasks[].model` and `--model` flags. */
  slug: string;
  /** Canonical SDK selection passed to `Agent.create({ model })`. */
  selection: ModelSelection;
  summary: string;
  strengths: string[];
  speed: "fast" | "medium" | "slow";
  use: string;
  /** Task types this profile is the default for. */
  defaultFor?: TaskType[];
}

/** Env vars that override catalog `defaultFor` when set (non-empty). */
export const MODEL_ENV_BY_TYPE: Record<TaskType, string> = {
  worker: "ORCHESTRATE_MODEL_WORKER",
  subplanner: "ORCHESTRATE_MODEL_SUBPLANNER",
  verifier: "ORCHESTRATE_MODEL_VERIFIER",
};

/** Env var that overrides the kickoff `--model` default for the root planner. */
export const MODEL_ENV_ROOT = "ORCHESTRATE_MODEL_ROOT";

export const DEFAULT_ROOT_MODEL = "claude-opus-4-8";

// `slug` is the stable authoring name; `selection` is the canonical SDK form.
// Run `bun cli.ts models --check` after SDK or backend model-schema drift.
export const MODEL_CATALOG: ModelProfile[] = [
  {
    slug: "claude-opus-4-8",
    selection: { id: "claude-opus-4-8" },
    summary: "Solid judgment Opus; right tier for verifier acceptance checks.",
    strengths: [
      "judgment",
      "acceptance criteria",
      "frontend",
      "UX decisions",
      "ambiguity resolution",
    ],
    speed: "slow",
    use: "Default for verifiers; focused acceptance-criteria checks don't need xhigh. Also a good pick for subplanners or workers owning judgment-heavy or frontend slices when the deep-thinking variant is overkill.",
    defaultFor: ["verifier"],
  },
  {
    slug: "opus-max",
    selection: {
      id: "claude-opus-4-8",
      params: [
        { id: "thinking", value: "true" },
        { id: "context", value: "1m" },
        { id: "effort", value: "max" },
      ],
    },
    summary:
      "Maximum-reasoning Opus; reserved for exceptionally difficult judgment tasks.",
    strengths: ["complex judgment", "deep reasoning", "ambiguity resolution"],
    speed: "slow",
    use: "Reserved for exceptionally difficult tasks. May overthink simple problems — only reach for this when standard `claude-opus-4-8` has produced unsatisfying results.",
  },
  {
    slug: "gpt-5.5-high-fast",
    selection: {
      id: "gpt-5.5",
      params: [
        { id: "reasoning", value: "high" },
        { id: "fast", value: "true" },
      ],
    },
    summary: "Strong systems, architecture, algorithms, tricky code.",
    strengths: [
      "systems design",
      "architecture",
      "algorithms",
      "refactoring",
      "subtle correctness",
    ],
    speed: "medium",
    use: "Default for workers. Pick this for systems/architecture slices and tasks needing careful correctness. Reach for `gpt-5.5-high` (non-fast) when quality matters more than throughput.",
    defaultFor: ["worker"],
  },
  {
    slug: "gpt-5.5-high",
    selection: {
      id: "gpt-5.5",
      params: [
        { id: "reasoning", value: "high" },
        { id: "fast", value: "false" },
      ],
    },
    summary:
      "Non-fast `gpt-5.5-high`; trades latency for higher-quality systems work.",
    strengths: [
      "systems design",
      "architecture",
      "algorithms",
      "refactoring",
      "subtle correctness",
    ],
    speed: "slow",
    use: "Workers whose task is non-trivial and where quality matters more than throughput. Reach for this over `gpt-5.5-high-fast` when subtle correctness matters more than turnaround.",
  },
  {
    slug: "claude-opus-4-8-thinking-xhigh",
    selection: {
      id: "claude-opus-4-8",
      params: [
        { id: "thinking", value: "true" },
        { id: "effort", value: "xhigh" },
      ],
    },
    summary:
      "Thinking Opus at xhigh effort; reserved for orchestration roles where deep judgment matters most.",
    strengths: ["judgment", "second opinions", "prose", "ambiguity resolution"],
    speed: "slow",
    use: "Default for subplanners: they decompose, route, and synthesize, where deep judgment pays off. Also the code discipline subagent default for prose, judgment, and second opinions. Resolved here so planners can pass the slug straight through `Task({ model })` without falling through to bare `{ id }` and being rejected as `invalid_model`.",
    defaultFor: ["subplanner"],
  },
  {
    slug: "gpt-5.3-codex-high-fast",
    selection: {
      id: "gpt-5.3-codex",
      params: [
        { id: "reasoning", value: "high" },
        { id: "fast", value: "true" },
      ],
    },
    summary: "Codex 5.3 tuned for quick, code-shaped implementation work.",
    strengths: ["code synthesis", "throughput", "tool calls"],
    speed: "fast",
    use: "Workers doing well-scoped code edits when `gpt-5.5-high-fast` is overkill. Reach for this when the task is mechanical code generation, not subtle algorithmic correctness.",
  },
  {
    slug: "gpt-xhigh",
    // 1m context requires fast=false per /v1/models. Fast=true caps at 272k.
    // Hard tasks usually need the larger window, so we pay the latency.
    selection: {
      id: "gpt-5.5",
      params: [
        { id: "context", value: "1m" },
        { id: "reasoning", value: "extra-high" },
        { id: "fast", value: "false" },
      ],
    },
    summary:
      "Maximum-reasoning GPT-5.5; reserved for exceptionally hard systems work.",
    strengths: [
      "complex algorithms",
      "subtle correctness",
      "deep architectural reasoning",
    ],
    speed: "slow",
    use: "Reserved for exceptionally difficult tasks. May overthink simple problems — only reach for this when standard `gpt-5.5-high-fast` has produced unsatisfying results.",
  },
  {
    slug: "composer-2-fast",
    selection: {
      id: "composer-2",
      params: [{ id: "fast", value: "true" }],
    },
    summary:
      "Fast and balanced; good throughput for bounded implementation work.",
    strengths: [
      "throughput",
      "well-scoped implementation",
      "straight-line code",
    ],
    speed: "fast",
    use: "Default for workers with clear acceptance criteria and bounded scope. The balanced choice when correctness risk is low.",
  },
];

function readEnvOverride(name: string): string | undefined {
  const raw = process.env[name]?.trim();
  return raw || undefined;
}

/** True when `spec` looks like a JSON ModelSelection object literal. */
export function looksLikeSelectionJson(spec: string): boolean {
  return spec.trimStart().startsWith("{");
}

/**
 * Parse a dual-format model override: catalog slug, bare model id, or JSON
 * `ModelSelection` (`{"id":"…","params":[…]}`).
 *
 * JSON form is for models not yet in MODEL_CATALOG (e.g. composer-2.5) where
 * a bare `{ id: slug }` would lose required params or fail `invalid_model`.
 */
export function parseModelSelectionJson(raw: string): ModelSelection {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(
      `invalid model selection JSON: ${err instanceof Error ? err.message : String(err)}`
    );
  }
  if (
    parsed === null ||
    typeof parsed !== "object" ||
    Array.isArray(parsed) ||
    typeof (parsed as { id?: unknown }).id !== "string" ||
    !(parsed as { id: string }).id.trim()
  ) {
    throw new Error(
      'invalid model selection JSON: expected {"id":"<model-id>", "params"?: [{"id","value"}, ...]}'
    );
  }
  const obj = parsed as { id: string; params?: unknown };
  const selection: ModelSelection = { id: obj.id.trim() };
  if (obj.params !== undefined) {
    if (!Array.isArray(obj.params)) {
      throw new Error(
        'invalid model selection JSON: "params" must be an array of {id, value}'
      );
    }
    const params: { id: string; value: string }[] = [];
    for (const p of obj.params) {
      if (
        p === null ||
        typeof p !== "object" ||
        typeof (p as { id?: unknown }).id !== "string" ||
        typeof (p as { value?: unknown }).value !== "string"
      ) {
        throw new Error(
          "invalid model selection JSON: each params entry must be {id: string, value: string}"
        );
      }
      params.push({
        id: (p as { id: string }).id,
        value: (p as { value: string }).value,
      });
    }
    selection.params = params;
  }
  return selection;
}

/** Compact label for catalog / attention logs. */
export function formatModelSelectionLabel(selection: ModelSelection): string {
  if (!selection.params?.length) return selection.id;
  const params = selection.params.map(p => `${p.id}=${p.value}`).join(", ");
  return `${selection.id} (${params})`;
}

/**
 * Fallback model spec when `tasks[].model` is omitted.
 * Returns a catalog slug, bare id, or JSON ModelSelection string from env.
 */
export function defaultModelForType(type: TaskType): string {
  const fromEnv = readEnvOverride(MODEL_ENV_BY_TYPE[type]);
  if (fromEnv) return fromEnv;

  const match = MODEL_CATALOG.find(m => m.defaultFor?.includes(type));
  if (!match)
    throw new Error(`MODEL_CATALOG missing default for TaskType "${type}"`);
  return match.slug;
}

/** Kickoff `--model` default: ORCHESTRATE_MODEL_ROOT, else catalog root default. */
export function defaultRootModel(): string {
  return readEnvOverride(MODEL_ENV_ROOT) ?? DEFAULT_ROOT_MODEL;
}

export function isKnownModel(slug: string): boolean {
  if (looksLikeSelectionJson(slug)) return false;
  return MODEL_CATALOG.some(m => m.slug === slug);
}

/**
 * Resolve an authoring slug, bare model id, or JSON ModelSelection into the
 * canonical SDK form passed to `Agent.create({ model })`.
 */
export function resolveModelSelection(spec: string): ModelSelection {
  const trimmed = spec.trim();
  if (looksLikeSelectionJson(trimmed)) {
    return parseModelSelectionJson(trimmed);
  }
  const profile = MODEL_CATALOG.find(m => m.slug === trimmed);
  return profile ? profile.selection : { id: trimmed };
}

/** Effective default label per task type (catalog or env override). */
export function effectiveDefaultLabelForType(type: TaskType): string {
  const spec = defaultModelForType(type);
  if (looksLikeSelectionJson(spec)) {
    return formatModelSelectionLabel(parseModelSelectionJson(spec));
  }
  return spec;
}

export function renderModelCatalog(): string {
  const types: TaskType[] = ["worker", "subplanner", "verifier"];
  const effectiveByType = new Map<TaskType, string>();
  for (const type of types) {
    effectiveByType.set(type, effectiveDefaultLabelForType(type));
  }

  // Map catalog slug → roles that currently default to it (after env overrides).
  const defaultsBySlug = new Map<string, TaskType[]>();
  const nonCatalogDefaults: { type: TaskType; label: string }[] = [];
  for (const type of types) {
    const label = effectiveByType.get(type);
    if (label === undefined) continue;
    if (isKnownModel(label)) {
      const list = defaultsBySlug.get(label) ?? [];
      list.push(type);
      defaultsBySlug.set(label, list);
    } else {
      nonCatalogDefaults.push({ type, label });
    }
  }

  const lines: string[] = [];
  if (nonCatalogDefaults.length) {
    lines.push(
      "Env default overrides (not in MODEL_CATALOG; used when `tasks[].model` is omitted):"
    );
    for (const { type, label } of nonCatalogDefaults) {
      const envName = MODEL_ENV_BY_TYPE[type];
      lines.push(`- ${type}: \`${label}\` (from ${envName})`);
    }
    lines.push("");
  }

  for (const m of MODEL_CATALOG) {
    const defaults = defaultsBySlug.get(m.slug);
    const defaultsNote = defaults?.length
      ? ` (default for ${defaults.join(", ")})`
      : "";
    lines.push(`- \`${m.slug}\` — ${m.summary}${defaultsNote}`);
    lines.push(`  speed: ${m.speed}; strengths: ${m.strengths.join(", ")}`);
    lines.push(`  use: ${m.use}`);
  }
  return lines.join("\n");
}
