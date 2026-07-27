import type { ModelSelection } from "@cursor/sdk";

import type { TaskType } from "./adapters/types.ts";

// Built-in model catalog. `buildEffectiveCatalog` merges this with the
// ORCHESTRATE_MODEL_* env config to produce what planners actually see;
// `defaultFor` supplies the fallback when `tasks[].model` is omitted.

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

/** Env var holding a JSON array of extra catalog entries. */
export const MODEL_ENV_CATALOG = "ORCHESTRATE_MODEL_CATALOG";

/** Env var selecting `merge` (default) or `env-only` catalog construction. */
export const MODEL_ENV_CATALOG_MODE = "ORCHESTRATE_MODEL_CATALOG_MODE";

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

/** Raised when the ORCHESTRATE_MODEL_* environment config is not usable. */
export class ModelConfigError extends Error {}

const ALL_TASK_TYPES: TaskType[] = ["worker", "subplanner", "verifier"];

const SPEEDS = new Set<ModelProfile["speed"]>(["fast", "medium", "slow"]);

function readEnvOverride(name: string): string | undefined {
  const raw = process.env[name]?.trim();
  return raw || undefined;
}

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

/**
 * Parse a JSON `ModelSelection` (`{"id":"…","params":[…]}`).
 *
 * JSON form is for models not yet in MODEL_CATALOG (e.g. composer-2.5) where
 * a bare `{ id: slug }` would lose required params or fail `invalid_model`.
 */
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

export type CatalogMode = "merge" | "env-only";

/**
 * `env-only` drops MODEL_CATALOG from the effective catalog so a team can
 * publish an exact menu of models. Built-in entries can still be pulled back
 * in by slug reference from ORCHESTRATE_MODEL_CATALOG or a role env var.
 */
export function readCatalogMode(): CatalogMode {
  const raw = readEnvOverride(MODEL_ENV_CATALOG_MODE);
  if (!raw) return "merge";
  const normalized = raw.toLowerCase();
  if (normalized === "merge" || normalized === "env-only") return normalized;
  throw new ModelConfigError(
    `${MODEL_ENV_CATALOG_MODE}="${raw}" is not valid. Use "merge" (default) or "env-only".`
  );
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

function parseDefaultFor(value: unknown, ctx: string): TaskType[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) {
    throw new ModelConfigError(
      `${ctx}: "defaultFor" must be an array of ${ALL_TASK_TYPES.join(" | ")}`
    );
  }
  const types: TaskType[] = [];
  for (const item of value) {
    if (
      typeof item !== "string" ||
      !ALL_TASK_TYPES.includes(item as TaskType)
    ) {
      throw new ModelConfigError(
        `${ctx}: "defaultFor" entries must be one of ${ALL_TASK_TYPES.join(", ")}`
      );
    }
    types.push(item as TaskType);
  }
  return types;
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

/** A parsed env entry: either a reference to an existing slug, or a profile. */
type CatalogEntryInput =
  | { kind: "ref"; slug: string; defaultFor?: TaskType[] }
  | { kind: "profile"; profile: ModelProfile };

function parseEntryObject(
  raw: Record<string, unknown>,
  ctx: string
): CatalogEntryInput {
  const slug = optionalString(raw.slug, "slug", ctx);
  const defaultFor = parseDefaultFor(raw.defaultFor, ctx);
  const hasSelection = raw.selection !== undefined || raw.id !== undefined;
  if (!hasSelection) {
    if (!slug) {
      throw new ModelConfigError(
        `${ctx}: entry needs "id" (or "selection"), or a "slug" that references a built-in model`
      );
    }
    return { kind: "ref", slug, defaultFor };
  }
  const selection = normalizeModelSelection(
    raw.selection ?? { id: raw.id, params: raw.params },
    ctx
  );
  const label = formatModelSelectionLabel(selection);
  return {
    kind: "profile",
    profile: {
      slug: slug ?? selection.id,
      selection,
      summary:
        optionalString(raw.summary, "summary", ctx) ??
        `Operator-configured model (${label}).`,
      strengths: parseStrengths(raw.strengths, ctx),
      speed: parseSpeed(raw.speed, ctx),
      use:
        optionalString(raw.use, "use", ctx) ??
        "Configured for this repo via orchestrate model env config. Prefer it unless the task needs a listed specialist.",
      defaultFor,
    },
  };
}

/** Role env vars accept a slug, a bare model id, or a JSON entry. */
function parseRoleEnvValue(raw: string, envName: string): CatalogEntryInput {
  if (looksLikeSelectionJson(raw)) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (err) {
      throw new ModelConfigError(`${envName}: ${errText(err)}`);
    }
    if (!isPlainObject(parsed)) {
      throw new ModelConfigError(`${envName}: expected a JSON object`);
    }
    return parseEntryObject(parsed, envName);
  }
  return { kind: "ref", slug: raw };
}

function builtinBySlug(slug: string): ModelProfile | undefined {
  return MODEL_CATALOG.find(m => m.slug === slug);
}

/**
 * Resolve a slug reference. Role env vars may name a model that isn't in the
 * built-in catalog (`composer-2.5`); it becomes a bare `{ id }` entry.
 * ORCHESTRATE_MODEL_CATALOG refs must name a built-in, since a typo there
 * would silently publish a non-existent model to planners.
 */
function resolveRef(
  slug: string,
  ctx: string,
  synthesizeIfUnknown: boolean
): ModelProfile {
  const builtin = builtinBySlug(slug);
  if (builtin) return { ...builtin };
  if (!synthesizeIfUnknown) {
    throw new ModelConfigError(
      `${ctx}: "${slug}" is not a built-in MODEL_CATALOG slug. Give the entry an "id" to define a new model, or use a known slug.`
    );
  }
  return {
    slug,
    selection: { id: slug },
    summary: `Operator-configured model (${slug}).`,
    strengths: [],
    speed: "medium",
    use: "Configured for this repo via orchestrate model env config. Prefer it unless the task needs a listed specialist.",
  };
}

export interface EffectiveCatalog {
  mode: CatalogMode;
  catalog: ModelProfile[];
  /** Effective role defaults, by slug. Missing when nothing claims the role. */
  defaults: Partial<Record<TaskType, string>>;
}

/**
 * Merge MODEL_CATALOG with the ORCHESTRATE_MODEL_* env config into the catalog
 * planners actually see. Built per call so env changes apply without reload.
 */
export function buildEffectiveCatalog(): EffectiveCatalog {
  const mode = readCatalogMode();
  const bySlug = new Map<string, ModelProfile>();
  const order: string[] = [];
  const upsert = (profile: ModelProfile): void => {
    if (!bySlug.has(profile.slug)) order.push(profile.slug);
    bySlug.set(profile.slug, profile);
  };

  if (mode === "merge") {
    for (const profile of MODEL_CATALOG) upsert({ ...profile });
  }

  const declared: Partial<Record<TaskType, string>> = {};

  const rawCatalog = readEnvOverride(MODEL_ENV_CATALOG);
  if (rawCatalog) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(rawCatalog);
    } catch (err) {
      throw new ModelConfigError(`${MODEL_ENV_CATALOG}: ${errText(err)}`);
    }
    if (!Array.isArray(parsed)) {
      throw new ModelConfigError(
        `${MODEL_ENV_CATALOG}: expected a JSON array of model entries`
      );
    }
    parsed.forEach((item, i) => {
      const ctx = `${MODEL_ENV_CATALOG}[${i}]`;
      if (!isPlainObject(item)) {
        throw new ModelConfigError(`${ctx}: expected a JSON object`);
      }
      const entry = parseEntryObject(item, ctx);
      const profile =
        entry.kind === "ref"
          ? {
              ...resolveRef(entry.slug, ctx, false),
              defaultFor: entry.defaultFor,
            }
          : entry.profile;
      upsert(profile);
      for (const type of profile.defaultFor ?? []) {
        const prior = declared[type];
        if (prior && prior !== profile.slug) {
          throw new ModelConfigError(
            `${MODEL_ENV_CATALOG}: two entries claim the ${type} default ("${prior}" and "${profile.slug}")`
          );
        }
        declared[type] = profile.slug;
      }
    });
  }

  // Role env vars are the most specific signal, so they win over any
  // defaultFor declared inside ORCHESTRATE_MODEL_CATALOG.
  for (const type of ALL_TASK_TYPES) {
    const envName = MODEL_ENV_BY_TYPE[type];
    const raw = readEnvOverride(envName);
    if (!raw) continue;
    const entry = parseRoleEnvValue(raw, envName);
    const profile =
      entry.kind === "ref"
        ? resolveRef(entry.slug, envName, true)
        : entry.profile;
    const existing = bySlug.get(profile.slug);
    upsert(entry.kind === "ref" && existing ? existing : profile);
    declared[type] = profile.slug;
  }

  // Inherit unclaimed roles from whatever remains in the catalog.
  for (const type of ALL_TASK_TYPES) {
    if (declared[type]) continue;
    const inherited = order
      .map(slug => bySlug.get(slug))
      .find(profile => profile?.defaultFor?.includes(type));
    if (inherited) declared[type] = inherited.slug;
  }

  // Re-stamp defaultFor so rendering reflects the resolved defaults.
  const rolesBySlug = new Map<string, TaskType[]>();
  for (const type of ALL_TASK_TYPES) {
    const slug = declared[type];
    if (!slug) continue;
    const roles = rolesBySlug.get(slug) ?? [];
    roles.push(type);
    rolesBySlug.set(slug, roles);
  }

  const catalog: ModelProfile[] = [];
  for (const slug of order) {
    const profile = bySlug.get(slug);
    if (!profile) continue;
    const roles = rolesBySlug.get(slug);
    catalog.push({ ...profile, defaultFor: roles?.length ? roles : undefined });
  }

  return { mode, catalog, defaults: declared };
}

/** The catalog planners see: MODEL_CATALOG plus/minus the env config. */
export function effectiveModelCatalog(): ModelProfile[] {
  return buildEffectiveCatalog().catalog;
}

/**
 * Fallback model slug when `tasks[].model` is omitted. Resolves against the
 * effective catalog, so env config participates.
 */
export function defaultModelForType(type: TaskType): string {
  const { defaults, mode } = buildEffectiveCatalog();
  const slug = defaults[type];
  if (slug) return slug;
  if (mode === "env-only") {
    throw new ModelConfigError(
      `no ${type} default: ${MODEL_ENV_CATALOG_MODE}=env-only drops MODEL_CATALOG, so set ${MODEL_ENV_BY_TYPE[type]} or give an ${MODEL_ENV_CATALOG} entry "defaultFor": ["${type}"]`
    );
  }
  throw new ModelConfigError(
    `MODEL_CATALOG missing default for TaskType "${type}"`
  );
}

/** Kickoff `--model` default: ORCHESTRATE_MODEL_ROOT, else the built-in root model. */
export function defaultRootModel(): string {
  return readEnvOverride(MODEL_ENV_ROOT) ?? DEFAULT_ROOT_MODEL;
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

/** Effective default label per task type (catalog entry or env override). */
export function effectiveDefaultLabelForType(type: TaskType): string {
  return defaultModelForType(type);
}

/**
 * Fail fast on unusable ORCHESTRATE_MODEL_* config instead of surfacing it as
 * a spawn error halfway through a run.
 */
export function assertModelEnvConfig(): void {
  const { defaults, mode } = buildEffectiveCatalog();
  if (mode !== "env-only") return;
  const missing = ALL_TASK_TYPES.filter(type => !defaults[type]);
  if (!missing.length) return;
  throw new ModelConfigError(
    `${MODEL_ENV_CATALOG_MODE}=env-only leaves no default for ${missing.join(", ")}. Set ${missing
      .map(type => MODEL_ENV_BY_TYPE[type])
      .join(", ")}, or add "defaultFor" to an ${MODEL_ENV_CATALOG} entry.`
  );
}

export function renderModelCatalog(): string {
  const { catalog, mode } = buildEffectiveCatalog();
  const lines: string[] = [];
  if (mode === "env-only") {
    lines.push(
      "This repo publishes an exact model menu. Use only the slugs listed below; do not reach for models outside this list."
    );
    lines.push("");
  }
  for (const m of catalog) {
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
