import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import {
  assertModelEnvConfig,
  buildEffectiveCatalog,
  DEFAULT_ROOT_MODEL,
  defaultModelForType,
  defaultRootModel,
  effectiveModelCatalog,
  formatModelSelectionLabel,
  isKnownModel,
  MODEL_ENV_BY_TYPE,
  MODEL_ENV_CATALOG,
  MODEL_ENV_CATALOG_MODE,
  MODEL_ENV_ROOT,
  ModelConfigError,
  parseModelSelectionJson,
  renderModelCatalog,
  resolveModelSelection,
} from "../models.ts";

const ENV_KEYS = [
  MODEL_ENV_BY_TYPE.worker,
  MODEL_ENV_BY_TYPE.subplanner,
  MODEL_ENV_BY_TYPE.verifier,
  MODEL_ENV_ROOT,
  MODEL_ENV_CATALOG,
  MODEL_ENV_CATALOG_MODE,
] as const;

const savedEnv: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const key of ENV_KEYS) {
    savedEnv[key] = process.env[key];
    delete process.env[key];
  }
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    const prior = savedEnv[key];
    if (prior === undefined) delete process.env[key];
    else process.env[key] = prior;
  }
});

describe("per-role env overrides", () => {
  test("catalog defaults apply when env is unset", () => {
    expect(defaultModelForType("worker")).toBe("gpt-5.5-high-fast");
    expect(defaultModelForType("subplanner")).toBe(
      "claude-opus-4-8-thinking-xhigh"
    );
    expect(defaultModelForType("verifier")).toBe("claude-opus-4-8");
  });

  test("catalog slug in env overrides defaultFor", () => {
    process.env.ORCHESTRATE_MODEL_WORKER = "composer-2-fast";
    expect(defaultModelForType("worker")).toBe("composer-2-fast");
    expect(resolveModelSelection("composer-2-fast")).toEqual({
      id: "composer-2",
      params: [{ id: "fast", value: "true" }],
    });
    expect(defaultModelForType("verifier")).toBe("claude-opus-4-8");
  });

  test("whitespace-only env is treated as unset", () => {
    process.env.ORCHESTRATE_MODEL_WORKER = "   ";
    expect(defaultModelForType("worker")).toBe("gpt-5.5-high-fast");
  });

  test("bare unknown id joins the catalog and round-trips", () => {
    process.env.ORCHESTRATE_MODEL_WORKER = "composer-2.5";
    expect(defaultModelForType("worker")).toBe("composer-2.5");
    // Merged in, so a planner copying the slug resolves back to the same model.
    expect(isKnownModel("composer-2.5")).toBe(true);
    expect(resolveModelSelection("composer-2.5")).toEqual({
      id: "composer-2.5",
    });
  });

  test("JSON entry keeps params and gets a slug", () => {
    process.env.ORCHESTRATE_MODEL_WORKER =
      '{"id":"composer-2.5","params":[{"id":"fast","value":"true"}]}';
    const slug = defaultModelForType("worker");
    expect(slug).toBe("composer-2.5");
    expect(resolveModelSelection(slug)).toEqual({
      id: "composer-2.5",
      params: [{ id: "fast", value: "true" }],
    });
  });

  test("JSON entry can name its own slug and prose", () => {
    process.env.ORCHESTRATE_MODEL_WORKER = JSON.stringify({
      slug: "composer-cheap",
      id: "composer-2.5",
      params: [{ id: "fast", value: "true" }],
      summary: "House worker model.",
      use: "Use for all bounded implementation work.",
      speed: "fast",
      strengths: ["throughput"],
    });
    expect(defaultModelForType("worker")).toBe("composer-cheap");
    expect(resolveModelSelection("composer-cheap")).toEqual({
      id: "composer-2.5",
      params: [{ id: "fast", value: "true" }],
    });
    const text = renderModelCatalog();
    expect(text).toContain("`composer-cheap` — House worker model.");
    expect(text).toContain("(default for worker)");
    expect(text).toContain("speed: fast; strengths: throughput");
  });

  test("invalid JSON selection throws a clear error", () => {
    expect(() => parseModelSelectionJson("{not-json")).toThrow(
      /invalid model selection JSON/
    );
    expect(() => parseModelSelectionJson('{"params":[]}')).toThrow(
      /expected \{"id"/
    );
    expect(() =>
      parseModelSelectionJson('{"id":"x","params":[{"id":1,"value":"a"}]}')
    ).toThrow(/each params entry/);
  });

  test("defaultRootModel reads ORCHESTRATE_MODEL_ROOT", () => {
    expect(defaultRootModel()).toBe(DEFAULT_ROOT_MODEL);
    process.env.ORCHESTRATE_MODEL_ROOT = "composer-2-fast";
    expect(defaultRootModel()).toBe("composer-2-fast");
    process.env.ORCHESTRATE_MODEL_ROOT = '{"id":"composer-2.5"}';
    expect(resolveModelSelection(defaultRootModel())).toEqual({
      id: "composer-2.5",
    });
  });

  test("rendered catalog moves the default label to the override", () => {
    process.env.ORCHESTRATE_MODEL_WORKER = "composer-2-fast";
    const text = renderModelCatalog();
    const composerLine = text
      .split("\n")
      .find(l => l.includes("`composer-2-fast`"));
    const gptLine = text
      .split("\n")
      .find(l => l.includes("`gpt-5.5-high-fast`"));
    expect(composerLine).toContain("(default for worker)");
    expect(gptLine).not.toContain("default for worker");
  });

  test("formatModelSelectionLabel renders params", () => {
    expect(
      formatModelSelectionLabel({
        id: "composer-2.5",
        params: [{ id: "fast", value: "true" }],
      })
    ).toBe("composer-2.5 (fast=true)");
  });
});

describe("ORCHESTRATE_MODEL_CATALOG", () => {
  test("adds entries alongside the built-in catalog", () => {
    process.env.ORCHESTRATE_MODEL_CATALOG = JSON.stringify([
      { id: "composer-2.5", summary: "Cheap worker." },
    ]);
    const slugs = effectiveModelCatalog().map(m => m.slug);
    expect(slugs).toContain("composer-2.5");
    expect(slugs).toContain("gpt-5.5-high-fast");
  });

  test("entry defaultFor claims a role", () => {
    process.env.ORCHESTRATE_MODEL_CATALOG = JSON.stringify([
      { id: "composer-2.5", defaultFor: ["worker"] },
    ]);
    expect(defaultModelForType("worker")).toBe("composer-2.5");
  });

  test("role env var wins over an entry defaultFor", () => {
    process.env.ORCHESTRATE_MODEL_CATALOG = JSON.stringify([
      { id: "composer-2.5", defaultFor: ["worker"] },
    ]);
    process.env.ORCHESTRATE_MODEL_WORKER = "composer-2-fast";
    expect(defaultModelForType("worker")).toBe("composer-2-fast");
  });

  test("two entries claiming one role is a config error", () => {
    process.env.ORCHESTRATE_MODEL_CATALOG = JSON.stringify([
      { id: "composer-2.5", defaultFor: ["worker"] },
      { id: "grok-4-5", defaultFor: ["worker"] },
    ]);
    expect(() => buildEffectiveCatalog()).toThrow(/claim the worker default/);
  });

  test("entry can override a built-in slug's selection", () => {
    process.env.ORCHESTRATE_MODEL_CATALOG = JSON.stringify([
      { slug: "composer-2-fast", id: "composer-2.5" },
    ]);
    expect(resolveModelSelection("composer-2-fast")).toEqual({
      id: "composer-2.5",
    });
  });

  test("slug-only entry referencing an unknown model is rejected", () => {
    process.env.ORCHESTRATE_MODEL_CATALOG = JSON.stringify([
      { slug: "not-a-builtin" },
    ]);
    expect(() => buildEffectiveCatalog()).toThrow(
      /not a built-in MODEL_CATALOG slug/
    );
  });

  test("malformed config surfaces as ModelConfigError", () => {
    process.env.ORCHESTRATE_MODEL_CATALOG = '{"id":"x"}';
    expect(() => buildEffectiveCatalog()).toThrow(ModelConfigError);
    expect(() => buildEffectiveCatalog()).toThrow(/expected a JSON array/);

    process.env.ORCHESTRATE_MODEL_CATALOG = JSON.stringify([
      { id: "x", speed: "blistering" },
    ]);
    expect(() => buildEffectiveCatalog()).toThrow(/"speed" must be/);

    process.env.ORCHESTRATE_MODEL_CATALOG = JSON.stringify([
      { id: "x", defaultFor: ["planner"] },
    ]);
    expect(() => buildEffectiveCatalog()).toThrow(/"defaultFor" entries/);
  });
});

describe("ORCHESTRATE_MODEL_CATALOG_MODE=env-only", () => {
  test("drops built-ins so only listed models are published", () => {
    process.env.ORCHESTRATE_MODEL_CATALOG_MODE = "env-only";
    process.env.ORCHESTRATE_MODEL_CATALOG = JSON.stringify([
      { id: "composer-2.5", defaultFor: ["worker"] },
      { slug: "claude-opus-4-8", defaultFor: ["subplanner", "verifier"] },
    ]);
    const slugs = effectiveModelCatalog().map(m => m.slug);
    expect(slugs).toEqual(["composer-2.5", "claude-opus-4-8"]);
    expect(slugs).not.toContain("gpt-5.5-high-fast");
    expect(isKnownModel("gpt-5.5-high-fast")).toBe(false);
  });

  test("slug reference pulls a built-in back in with its params", () => {
    process.env.ORCHESTRATE_MODEL_CATALOG_MODE = "env-only";
    process.env.ORCHESTRATE_MODEL_CATALOG = JSON.stringify([
      { slug: "composer-2-fast", defaultFor: ["worker"] },
    ]);
    process.env.ORCHESTRATE_MODEL_SUBPLANNER = "claude-opus-4-8";
    process.env.ORCHESTRATE_MODEL_VERIFIER = "claude-opus-4-8";
    expect(resolveModelSelection("composer-2-fast")).toEqual({
      id: "composer-2",
      params: [{ id: "fast", value: "true" }],
    });
    expect(defaultModelForType("worker")).toBe("composer-2-fast");
    expect(defaultModelForType("subplanner")).toBe("claude-opus-4-8");
  });

  test("rendered catalog tells planners the menu is exact", () => {
    process.env.ORCHESTRATE_MODEL_CATALOG_MODE = "env-only";
    process.env.ORCHESTRATE_MODEL_CATALOG = JSON.stringify([
      { id: "composer-2.5", defaultFor: ["worker", "subplanner", "verifier"] },
    ]);
    const text = renderModelCatalog();
    expect(text).toContain("exact model menu");
    expect(text).not.toContain("gpt-5.5-high-fast");
  });

  test("missing role default fails fast with an actionable message", () => {
    process.env.ORCHESTRATE_MODEL_CATALOG_MODE = "env-only";
    process.env.ORCHESTRATE_MODEL_WORKER = "composer-2.5";
    expect(() => assertModelEnvConfig()).toThrow(ModelConfigError);
    expect(() => assertModelEnvConfig()).toThrow(
      /leaves no default for subplanner, verifier/
    );
    expect(() => defaultModelForType("verifier")).toThrow(
      /ORCHESTRATE_MODEL_VERIFIER/
    );
  });

  test("assertModelEnvConfig passes when every role resolves", () => {
    process.env.ORCHESTRATE_MODEL_CATALOG_MODE = "env-only";
    process.env.ORCHESTRATE_MODEL_WORKER = "composer-2.5";
    process.env.ORCHESTRATE_MODEL_SUBPLANNER = "claude-opus-4-8";
    process.env.ORCHESTRATE_MODEL_VERIFIER = "claude-opus-4-8";
    expect(() => assertModelEnvConfig()).not.toThrow();
  });

  test("unknown mode value is rejected", () => {
    process.env.ORCHESTRATE_MODEL_CATALOG_MODE = "exclusive";
    expect(() => buildEffectiveCatalog()).toThrow(/is not valid/);
  });

  test("merge mode is the default and keeps built-ins", () => {
    expect(buildEffectiveCatalog().mode).toBe("merge");
    expect(effectiveModelCatalog().map(m => m.slug)).toContain(
      "gpt-5.5-high-fast"
    );
  });
});
