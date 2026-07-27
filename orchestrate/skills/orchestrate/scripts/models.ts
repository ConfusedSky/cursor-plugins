import type { ModelSelection } from "@cursor/sdk";

import type { TaskType } from "./adapters/types.ts";

// Built-in model catalog, used when ORCHESTRATE_MODEL_CATALOG is unset.
// `defaultFor` supplies the model for a role when `tasks[].model` is omitted.

/** Roles a catalog entry can be the default for. `root` is the kickoff planner. */
export type CatalogRole = TaskType | "root";

export const CATALOG_ROLES: CatalogRole[] = [
  "worker",
  "subplanner",
  "verifier",
  "root",
];

/** Roles that must resolve for a run to be spawnable. */
const REQUIRED_ROLES: TaskType[] = ["worker", "subplanner", "verifier"];

export interface ModelProfile {
  /** User-facing slug for `tasks[].model` and `--model` flags. */
  slug: string;
  /** Canonical SDK selection passed to `Agent.create({ model })`. */
  selection: ModelSelection;
  summary: string;
  strengths: string[];
  speed: "fast" | "medium" | "slow";
  use: string;
  /** Roles this profile is the default for. */
  defaultFor?: CatalogRole[];
}

/**
 * Env var holding the whole catalog as JSON. When set it replaces
 * MODEL_CATALOG outright; entries may still reference a built-in by slug.
 */
export const MODEL_ENV_CATALOG = "ORCHESTRATE_MODEL_CATALOG";

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

/** Raised when ORCHESTRATE_MODEL_CATALOG is not usable. */
export class ModelConfigError extends Error {}

const SPEEDS = new Set<ModelProfile["speed"]>(["fast", "medium", "slow"]);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function errText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** True when `spec` looks like a JSON object literal rather than a slug. */
export function looksLikeSelectionJson(spec: string): boolean {
  return spec.trimStart().startsWith("{");
}

/** Validate an already-parsed `{ id, params? }` into a canonical selection. */
export function normalizeModelSelection(
  value: unknown,
  ctx = "invalid model selection JSON"
): ModelSelection {
  if (
    !isPlainObject(value) ||
    typeof value.id !== "string" ||
    !value.id.trim()
  ) {
    throw new ModelConfigError(
      `${ctx}: expected {"id":"<model-id>", "params"?: [{"id","value"}, ...]}`
    );
  }
  const selection: ModelSelection = { id: value.id.trim() };
  if (value.params !== undefined) {
    if (!Array.isArray(value.params)) {
      throw new ModelConfigError(
        `${ctx}: "params" must be an array of {id, value}`
      );
    }
    const params: { id: string; value: string }[] = [];
    for (const p of value.params) {
      if (
        !isPlainObject(p) ||
        typeof p.id !== "string" ||
        typeof p.value !== "string"
      ) {
        throw new ModelConfigError(
          `${ctx}: each params entry must be {id: string, value: string}`
        );
      }
      params.push({ id: p.id, value: p.value });
    }
    selection.params = params;
  }
  return selection;
}

/** Parse a JSON `ModelSelection` (`{"id":"…","params":[…]}`). */
export function parseModelSelectionJson(
  raw: string,
  ctx = "invalid model selection JSON"
): ModelSelection {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new ModelConfigError(`${ctx}: ${errText(err)}`);
  }
  return normalizeModelSelection(parsed, ctx);
}

/** Compact label for catalog / attention logs. */
export function formatModelSelectionLabel(selection: ModelSelection): string {
  if (!selection.params?.length) return selection.id;
  const params = selection.params.map(p => `${p.id}=${p.value}`).join(", ");
  return `${selection.id} (${params})`;
}

function parseSpeed(value: unknown, ctx: string): ModelProfile["speed"] {
  if (value === undefined) return "medium";
  if (typeof value === "string" && SPEEDS.has(value as ModelProfile["speed"])) {
    return value as ModelProfile["speed"];
  }
  throw new ModelConfigError(`${ctx}: "speed" must be fast, medium, or slow`);
}

function parseStrengths(value: unknown, ctx: string): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.some(v => typeof v !== "string")) {
    throw new ModelConfigError(
      `${ctx}: "strengths" must be an array of strings`
    );
  }
  return value as string[];
}

function parseDefaultFor(
  value: unknown,
  ctx: string
): CatalogRole[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) {
    throw new ModelConfigError(
      `${ctx}: "defaultFor" must be an array of ${CATALOG_ROLES.join(" | ")}`
    );
  }
  const roles: CatalogRole[] = [];
  for (const item of value) {
    if (
      typeof item !== "string" ||
      !CATALOG_ROLES.includes(item as CatalogRole)
    ) {
      throw new ModelConfigError(
        `${ctx}: "defaultFor" entries must be one of ${CATALOG_ROLES.join(", ")}`
      );
    }
    roles.push(item as CatalogRole);
  }
  return roles;
}

function optionalString(
  value: unknown,
  field: string,
  ctx: string
): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || !value.trim()) {
    throw new ModelConfigError(`${ctx}: "${field}" must be a non-empty string`);
  }
  return value.trim();
}

function builtinBySlug(slug: string): ModelProfile | undefined {
  return MODEL_CATALOG.find(m => m.slug === slug);
}

/**
 * Parse one ORCHESTRATE_MODEL_CATALOG entry. An entry with `id` (or
 * `selection`) defines a model; an entry with only `slug` pulls in the
 * built-in profile of that name, so operators can list a curated subset
 * without retyping SDK params.
 */
function parseCatalogEntry(
  raw: Record<string, unknown>,
  ctx: string
): ModelProfile {
  const slug = optionalString(raw.slug, "slug", ctx);
  const defaultFor = parseDefaultFor(raw.defaultFor, ctx);

  if (raw.selection === undefined && raw.id === undefined) {
    if (!slug) {
      throw new ModelConfigError(
        `${ctx}: entry needs "id" (or "selection"), or a "slug" that references a built-in model`
      );
    }
    const builtin = builtinBySlug(slug);
    if (!builtin) {
      throw new ModelConfigError(
        `${ctx}: "${slug}" is not a built-in MODEL_CATALOG slug. Give the entry an "id" to define a new model, or use a known slug.`
      );
    }
    return { ...builtin, defaultFor: defaultFor ?? builtin.defaultFor };
  }

  const selection = normalizeModelSelection(
    raw.selection ?? { id: raw.id, params: raw.params },
    ctx
  );
  return {
    slug: slug ?? selection.id,
    selection,
    summary:
      optionalString(raw.summary, "summary", ctx) ??
      `Operator-configured model (${formatModelSelectionLabel(selection)}).`,
    strengths: parseStrengths(raw.strengths, ctx),
    speed: parseSpeed(raw.speed, ctx),
    use:
      optionalString(raw.use, "use", ctx) ??
      "Configured for this repo via ORCHESTRATE_MODEL_CATALOG. Prefer it unless the task needs a listed specialist.",
    defaultFor,
  };
}

function readCatalogEnv(): string | undefined {
  const raw = process.env[MODEL_ENV_CATALOG]?.trim();
  return raw || undefined;
}

/** True when this repo publishes its own catalog instead of the built-in one. */
export function usingEnvCatalog(): boolean {
  return readCatalogEnv() !== undefined;
}

/**
 * The catalog planners choose from. ORCHESTRATE_MODEL_CATALOG replaces
 * MODEL_CATALOG outright when set; there is no merging, so the env value is
 * the complete menu. Built per call so env changes apply without reload.
 */
export function effectiveModelCatalog(): ModelProfile[] {
  const raw = readCatalogEnv();
  if (!raw) return MODEL_CATALOG;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new ModelConfigError(`${MODEL_ENV_CATALOG}: ${errText(err)}`);
  }
  if (!Array.isArray(parsed)) {
    throw new ModelConfigError(
      `${MODEL_ENV_CATALOG}: expected a JSON array of model entries`
    );
  }
  if (!parsed.length) {
    throw new ModelConfigError(
      `${MODEL_ENV_CATALOG}: needs at least one entry. Unset it to use the built-in catalog.`
    );
  }

  const catalog: ModelProfile[] = [];
  const bySlug = new Map<string, number>();
  const claimedBy = new Map<CatalogRole, string>();

  parsed.forEach((item, i) => {
    const ctx = `${MODEL_ENV_CATALOG}[${i}]`;
    if (!isPlainObject(item)) {
      throw new ModelConfigError(`${ctx}: expected a JSON object`);
    }
    const profile = parseCatalogEntry(item, ctx);

    const priorIndex = bySlug.get(profile.slug);
    if (priorIndex !== undefined) {
      throw new ModelConfigError(
        `${ctx}: duplicate slug "${profile.slug}" (also at index ${priorIndex})`
      );
    }
    bySlug.set(profile.slug, i);

    for (const role of profile.defaultFor ?? []) {
      const prior = claimedBy.get(role);
      if (prior) {
        throw new ModelConfigError(
          `${MODEL_ENV_CATALOG}: two entries claim the ${role} default ("${prior}" and "${profile.slug}")`
        );
      }
      claimedBy.set(role, profile.slug);
    }
    catalog.push(profile);
  });

  return catalog;
}

function defaultSlugForRole(role: CatalogRole): string | undefined {
  return effectiveModelCatalog().find(m => m.defaultFor?.includes(role))?.slug;
}

/** Model slug for a task type when `tasks[].model` is omitted. */
export function defaultModelForType(type: TaskType): string {
  const slug = defaultSlugForRole(type);
  if (slug) return slug;
  if (usingEnvCatalog()) {
    throw new ModelConfigError(
      `${MODEL_ENV_CATALOG} has no ${type} default. Add "defaultFor": ["${type}"] to one entry.`
    );
  }
  throw new ModelConfigError(
    `MODEL_CATALOG missing default for TaskType "${type}"`
  );
}

/**
 * Kickoff `--model` default. Honors a `defaultFor: ["root"]` catalog entry,
 * else falls back to the built-in root model.
 */
export function defaultRootModel(): string {
  return defaultSlugForRole("root") ?? DEFAULT_ROOT_MODEL;
}

export function isKnownModel(slug: string): boolean {
  if (looksLikeSelectionJson(slug)) return false;
  return effectiveModelCatalog().some(m => m.slug === slug);
}

/**
 * Resolve an authoring slug, bare model id, or JSON ModelSelection into the
 * canonical SDK form passed to `Agent.create({ model })`.
 *
 * Unknown slugs pass through as a bare `{ id }` so planners can reach
 * server-side models that aren't in the catalog.
 */
export function resolveModelSelection(spec: string): ModelSelection {
  const trimmed = spec.trim();
  if (looksLikeSelectionJson(trimmed)) {
    return parseModelSelectionJson(trimmed);
  }
  const profile = effectiveModelCatalog().find(m => m.slug === trimmed);
  return profile ? profile.selection : { id: trimmed };
}

/**
 * Fail fast on unusable catalog config instead of surfacing it as a spawn
 * error halfway through a run.
 */
export function assertModelEnvConfig(): void {
  if (!usingEnvCatalog()) return;
  const catalog = effectiveModelCatalog();
  const missing = REQUIRED_ROLES.filter(
    role => !catalog.some(m => m.defaultFor?.includes(role))
  );
  if (!missing.length) return;
  throw new ModelConfigError(
    `${MODEL_ENV_CATALOG} has no default for ${missing.join(", ")}. Add "defaultFor": [${missing
      .map(role => `"${role}"`)
      .join(", ")}] across your entries.`
  );
}

export function renderModelCatalog(): string {
  const catalog = effectiveModelCatalog();
  const lines: string[] = [];
  if (usingEnvCatalog()) {
    lines.push(
      "This repo publishes an exact model menu. Use only the slugs listed below; do not reach for models outside this list."
    );
    lines.push("");
  }
  for (const m of catalog) {
    const roles = m.defaultFor?.length
      ? ` (default for ${m.defaultFor.join(", ")})`
      : "";
    lines.push(`- \`${m.slug}\` — ${m.summary}${roles}`);
    const strengths = m.strengths.length
      ? `; strengths: ${m.strengths.join(", ")}`
      : "";
    lines.push(`  speed: ${m.speed}${strengths}`);
    lines.push(`  use: ${m.use}`);
  }
  return lines.join("\n");
}
