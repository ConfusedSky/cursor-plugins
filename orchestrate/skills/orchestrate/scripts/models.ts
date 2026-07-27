import type { ModelSelection } from "@cursor/sdk";

import type { TaskType } from "./adapters/types.ts";

// Built-in model catalog, used when ORCHESTRATE_MODEL_CATALOG is unset.
// `defaultFor` supplies the model for a task type when `tasks[].model` is
// omitted. Root planners take their model from kickoff `--model`, not here.

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

/**
 * Env var holding the whole catalog as JSON. When set it replaces
 * MODEL_CATALOG outright; entries may still reference a built-in by slug.
 */
export const MODEL_ENV_CATALOG = "ORCHESTRATE_MODEL_CATALOG";

const TASK_TYPES: TaskType[] = ["worker", "subplanner", "verifier"];

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

/** Raised when ORCHESTRATE_MODEL_CATALOG can't be read as a catalog. */
export class ModelConfigError extends Error {}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/**
 * Build one catalog entry. An entry with `id` (plus optional `params`)
 * defines a model; an entry with only `slug` pulls in the built-in profile of
 * that name, so operators can list a curated subset without retyping SDK
 * params. Descriptive fields are taken as given: a wrong value shows up in the
 * next spawn, which beats validating shapes that drift as models change.
 */
function toModelProfile(
  raw: Record<string, unknown>,
  ctx: string
): ModelProfile {
  const slug = typeof raw.slug === "string" ? raw.slug.trim() : undefined;
  const defaultFor = Array.isArray(raw.defaultFor)
    ? (raw.defaultFor as TaskType[])
    : undefined;

  if (raw.id === undefined) {
    const builtin = MODEL_CATALOG.find(m => m.slug === slug);
    if (!builtin) {
      throw new ModelConfigError(
        `${ctx}: needs an "id" to define a model, or a "slug" naming a built-in one (got ${JSON.stringify(slug ?? null)})`
      );
    }
    return { ...builtin, defaultFor: defaultFor ?? builtin.defaultFor };
  }

  if (typeof raw.id !== "string") {
    throw new ModelConfigError(`${ctx}: "id" must be a string`);
  }
  const selection: ModelSelection = { id: raw.id };
  if (Array.isArray(raw.params)) {
    selection.params = raw.params as ModelSelection["params"];
  }
  return {
    slug: slug ?? raw.id,
    selection,
    summary:
      typeof raw.summary === "string"
        ? raw.summary
        : `Configured for this repo via ${MODEL_ENV_CATALOG}.`,
    strengths: Array.isArray(raw.strengths) ? (raw.strengths as string[]) : [],
    speed:
      typeof raw.speed === "string"
        ? (raw.speed as ModelProfile["speed"])
        : "medium",
    use:
      typeof raw.use === "string"
        ? raw.use
        : "Prefer this unless the task needs a listed specialist.",
    defaultFor,
  };
}

function readEnvCatalog(): ModelProfile[] | undefined {
  const raw = process.env[MODEL_ENV_CATALOG]?.trim();
  if (!raw) return undefined;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new ModelConfigError(
      `${MODEL_ENV_CATALOG}: ${err instanceof Error ? err.message : String(err)}`
    );
  }
  if (!Array.isArray(parsed)) {
    throw new ModelConfigError(
      `${MODEL_ENV_CATALOG}: expected a JSON array of model entries`
    );
  }
  return parsed.map((item, i) => {
    const ctx = `${MODEL_ENV_CATALOG}[${i}]`;
    if (!isPlainObject(item)) {
      throw new ModelConfigError(`${ctx}: expected a JSON object`);
    }
    return toModelProfile(item, ctx);
  });
}

/**
 * The catalog planners choose from. ORCHESTRATE_MODEL_CATALOG replaces
 * MODEL_CATALOG outright when set; there is no merging, so the configured
 * list is the complete menu. Built per call so env changes apply on the spot.
 */
export function effectiveModelCatalog(): ModelProfile[] {
  return readEnvCatalog() ?? MODEL_CATALOG;
}

/** Model slug for a task type when `tasks[].model` is omitted. */
export function defaultModelForType(type: TaskType): string {
  const catalog = readEnvCatalog();
  const match = (catalog ?? MODEL_CATALOG).find(m =>
    m.defaultFor?.includes(type)
  );
  if (match) return match.slug;
  throw new ModelConfigError(
    catalog
      ? `${MODEL_ENV_CATALOG} has no ${type} default. Add "defaultFor": ["${type}"] to one entry.`
      : `MODEL_CATALOG missing default for TaskType "${type}"`
  );
}

export function isKnownModel(slug: string): boolean {
  return effectiveModelCatalog().some(m => m.slug === slug);
}

/** Unknown slugs pass through as a bare `{ id }` so planners can reach
 * server-side models that aren't in our prescriptive catalog. */
export function resolveModelSelection(slug: string): ModelSelection {
  const profile = effectiveModelCatalog().find(m => m.slug === slug);
  return profile ? profile.selection : { id: slug };
}

/**
 * Surface a broken catalog at CLI startup rather than as a spawn failure
 * partway through a run.
 */
export function assertModelEnvConfig(): void {
  for (const type of TASK_TYPES) defaultModelForType(type);
}

export function renderModelCatalog(): string {
  const envCatalog = readEnvCatalog();
  const lines: string[] = [];
  if (envCatalog) {
    lines.push(
      "This repo publishes an exact model menu. Use only the slugs listed below; do not reach for models outside this list."
    );
    lines.push("");
  }
  for (const m of envCatalog ?? MODEL_CATALOG) {
    const defaults = m.defaultFor?.length
      ? ` (default for ${m.defaultFor.join(", ")})`
      : "";
    lines.push(`- \`${m.slug}\` — ${m.summary}${defaults}`);
    const strengths = m.strengths.length
      ? `; strengths: ${m.strengths.join(", ")}`
      : "";
    lines.push(`  speed: ${m.speed}${strengths}`);
    lines.push(`  use: ${m.use}`);
  }
  return lines.join("\n");
}
