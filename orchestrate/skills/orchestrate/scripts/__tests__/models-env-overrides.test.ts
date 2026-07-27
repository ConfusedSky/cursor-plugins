import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import {
  assertModelEnvConfig,
  DEFAULT_ROOT_MODEL,
  defaultModelForType,
  defaultRootModel,
  effectiveModelCatalog,
  formatModelSelectionLabel,
  isKnownModel,
  MODEL_ENV_CATALOG,
  ModelConfigError,
  parseModelSelectionJson,
  renderModelCatalog,
  resolveModelSelection,
  usingEnvCatalog,
} from "../models.ts";

let saved: string | undefined;

function setCatalog(entries: unknown): void {
  process.env[MODEL_ENV_CATALOG] = JSON.stringify(entries);
}

beforeEach(() => {
  saved = process.env[MODEL_ENV_CATALOG];
  delete process.env[MODEL_ENV_CATALOG];
});

afterEach(() => {
  if (saved === undefined) delete process.env[MODEL_ENV_CATALOG];
  else process.env[MODEL_ENV_CATALOG] = saved;
});

describe("built-in catalog (ORCHESTRATE_MODEL_CATALOG unset)", () => {
  test("role defaults come from MODEL_CATALOG", () => {
    expect(usingEnvCatalog()).toBe(false);
    expect(defaultModelForType("worker")).toBe("gpt-5.5-high-fast");
    expect(defaultModelForType("subplanner")).toBe(
      "claude-opus-4-8-thinking-xhigh"
    );
    expect(defaultModelForType("verifier")).toBe("claude-opus-4-8");
    expect(defaultRootModel()).toBe(DEFAULT_ROOT_MODEL);
  });

  test("whitespace-only value is treated as unset", () => {
    process.env[MODEL_ENV_CATALOG] = "   ";
    expect(usingEnvCatalog()).toBe(false);
    expect(defaultModelForType("worker")).toBe("gpt-5.5-high-fast");
  });

  test("rendered catalog has no exact-menu preamble", () => {
    expect(renderModelCatalog()).not.toContain("exact model menu");
  });
});

describe("ORCHESTRATE_MODEL_CATALOG replaces the built-in catalog", () => {
  test("only the listed models are published", () => {
    setCatalog([
      { id: "composer-2.5", summary: "Cheap worker.", defaultFor: ["worker"] },
      { slug: "claude-opus-4-8", defaultFor: ["subplanner", "verifier"] },
    ]);
    expect(usingEnvCatalog()).toBe(true);
    expect(effectiveModelCatalog().map(m => m.slug)).toEqual([
      "composer-2.5",
      "claude-opus-4-8",
    ]);
    expect(isKnownModel("gpt-5.5-high-fast")).toBe(false);
    expect(isKnownModel("composer-2.5")).toBe(true);
  });

  test("entries define role defaults", () => {
    setCatalog([
      { id: "composer-2.5", defaultFor: ["worker"] },
      { slug: "claude-opus-4-8", defaultFor: ["subplanner", "verifier"] },
    ]);
    expect(defaultModelForType("worker")).toBe("composer-2.5");
    expect(defaultModelForType("subplanner")).toBe("claude-opus-4-8");
    expect(defaultModelForType("verifier")).toBe("claude-opus-4-8");
  });

  test("slug-only entry pulls in a built-in with its params", () => {
    setCatalog([{ slug: "composer-2-fast", defaultFor: ["worker"] }]);
    expect(resolveModelSelection("composer-2-fast")).toEqual({
      id: "composer-2",
      params: [{ id: "fast", value: "true" }],
    });
    expect(defaultModelForType("worker")).toBe("composer-2-fast");
  });

  test("entry keeps params and round-trips by slug", () => {
    setCatalog([
      {
        slug: "house-worker",
        id: "composer-2.5",
        params: [{ id: "fast", value: "true" }],
        summary: "House worker model.",
        use: "Use for all bounded implementation work.",
        speed: "fast",
        strengths: ["throughput"],
        defaultFor: ["worker"],
      },
    ]);
    expect(resolveModelSelection("house-worker")).toEqual({
      id: "composer-2.5",
      params: [{ id: "fast", value: "true" }],
    });
    const text = renderModelCatalog();
    expect(text).toContain("exact model menu");
    expect(text).toContain("`house-worker` — House worker model.");
    expect(text).toContain("(default for worker)");
    expect(text).toContain("speed: fast; strengths: throughput");
  });

  test("slug defaults to the model id and prose is synthesized", () => {
    setCatalog([{ id: "composer-2.5", defaultFor: ["worker"] }]);
    const [entry] = effectiveModelCatalog();
    expect(entry.slug).toBe("composer-2.5");
    expect(entry.summary).toContain("composer-2.5");
    expect(entry.speed).toBe("medium");
  });

  test("root default is configurable, else falls back", () => {
    setCatalog([{ id: "composer-2.5", defaultFor: ["worker"] }]);
    expect(defaultRootModel()).toBe(DEFAULT_ROOT_MODEL);
    setCatalog([
      { id: "composer-2.5", defaultFor: ["worker"] },
      { slug: "claude-opus-4-8", defaultFor: ["root"] },
    ]);
    expect(defaultRootModel()).toBe("claude-opus-4-8");
  });
});

describe("catalog config errors", () => {
  test("missing required role fails fast with an actionable message", () => {
    setCatalog([{ id: "composer-2.5", defaultFor: ["worker"] }]);
    expect(() => assertModelEnvConfig()).toThrow(ModelConfigError);
    expect(() => assertModelEnvConfig()).toThrow(
      /no default for subplanner, verifier/
    );
    expect(() => defaultModelForType("verifier")).toThrow(
      /"defaultFor": \["verifier"\]/
    );
  });

  test("assertModelEnvConfig passes when every role resolves", () => {
    setCatalog([
      { id: "composer-2.5", defaultFor: ["worker"] },
      { slug: "claude-opus-4-8", defaultFor: ["subplanner", "verifier"] },
    ]);
    expect(() => assertModelEnvConfig()).not.toThrow();
  });

  test("non-array, empty, and malformed JSON are rejected", () => {
    process.env[MODEL_ENV_CATALOG] = '{"id":"x"}';
    expect(() => effectiveModelCatalog()).toThrow(/expected a JSON array/);

    setCatalog([]);
    expect(() => effectiveModelCatalog()).toThrow(/at least one entry/);

    process.env[MODEL_ENV_CATALOG] = "[{id:}]";
    expect(() => effectiveModelCatalog()).toThrow(ModelConfigError);
  });

  test("unknown slug reference is rejected", () => {
    setCatalog([{ slug: "not-a-builtin" }]);
    expect(() => effectiveModelCatalog()).toThrow(
      /not a built-in MODEL_CATALOG slug/
    );
  });

  test("duplicate slugs are rejected", () => {
    setCatalog([{ id: "composer-2.5" }, { id: "composer-2.5" }]);
    expect(() => effectiveModelCatalog()).toThrow(/duplicate slug/);
  });

  test("two entries claiming one role is rejected", () => {
    setCatalog([
      { id: "composer-2.5", defaultFor: ["worker"] },
      { id: "grok-4-5", defaultFor: ["worker"] },
    ]);
    expect(() => effectiveModelCatalog()).toThrow(/claim the worker default/);
  });

  test("bad field values are rejected", () => {
    setCatalog([{ id: "x", speed: "blistering" }]);
    expect(() => effectiveModelCatalog()).toThrow(/"speed" must be/);

    setCatalog([{ id: "x", defaultFor: ["planner"] }]);
    expect(() => effectiveModelCatalog()).toThrow(/"defaultFor" entries/);

    setCatalog([{ id: "x", strengths: "fast" }]);
    expect(() => effectiveModelCatalog()).toThrow(/"strengths" must be/);

    setCatalog([{ summary: "no id or slug" }]);
    expect(() => effectiveModelCatalog()).toThrow(/entry needs "id"/);
  });
});

describe("selection parsing", () => {
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

  test("JSON selection passes through resolveModelSelection", () => {
    expect(
      resolveModelSelection(
        '{"id":"composer-2.5","params":[{"id":"fast","value":"true"}]}'
      )
    ).toEqual({
      id: "composer-2.5",
      params: [{ id: "fast", value: "true" }],
    });
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
