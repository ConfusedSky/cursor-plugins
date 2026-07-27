import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import {
  assertModelEnvConfig,
  defaultModelForType,
  effectiveModelCatalog,
  isKnownModel,
  MODEL_ENV_CATALOG,
  ModelConfigError,
  renderModelCatalog,
  resolveModelSelection,
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

describe("ORCHESTRATE_MODEL_CATALOG unset", () => {
  test("the built-in catalog is in effect", () => {
    expect(effectiveModelCatalog()).toBe(
      // Same array identity: no copying or merging when env is unset.
      effectiveModelCatalog()
    );
    expect(defaultModelForType("worker")).toBe("gpt-5.5-high-fast");
    expect(renderModelCatalog()).not.toContain("exact model menu");
  });

  test("whitespace-only value is treated as unset", () => {
    process.env[MODEL_ENV_CATALOG] = "   ";
    expect(defaultModelForType("worker")).toBe("gpt-5.5-high-fast");
  });
});

describe("ORCHESTRATE_MODEL_CATALOG replaces the built-in catalog", () => {
  test("only the listed models are published", () => {
    setCatalog([
      { id: "composer-2.5", summary: "Cheap worker.", defaultFor: ["worker"] },
      { slug: "claude-opus-4-8", defaultFor: ["subplanner", "verifier"] },
    ]);
    expect(effectiveModelCatalog().map(m => m.slug)).toEqual([
      "composer-2.5",
      "claude-opus-4-8",
    ]);
    expect(isKnownModel("gpt-5.5-high-fast")).toBe(false);
    expect(isKnownModel("composer-2.5")).toBe(true);
  });

  test("entries supply every task type's default", () => {
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

  test("a defined entry round-trips by slug with its params", () => {
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

  test("slug defaults to the id and prose is filled in", () => {
    setCatalog([{ id: "composer-2.5", defaultFor: ["worker"] }]);
    const [entry] = effectiveModelCatalog();
    expect(entry.slug).toBe("composer-2.5");
    expect(entry.summary).toContain("ORCHESTRATE_MODEL_CATALOG");
    expect(entry.speed).toBe("medium");
  });

  test("a model outside the catalog still passes through as a bare id", () => {
    setCatalog([{ id: "composer-2.5", defaultFor: ["worker"] }]);
    expect(resolveModelSelection("gpt-5.5")).toEqual({ id: "gpt-5.5" });
  });

  // Descriptive fields are passed through rather than validated, so new model
  // vocabulary doesn't require a plugin release.
  test("unrecognized descriptive values are passed through", () => {
    setCatalog([
      {
        id: "composer-2.5",
        speed: "blistering",
        strengths: ["novel-capability"],
        defaultFor: ["worker", "subplanner", "verifier"],
      },
    ]);
    expect(renderModelCatalog()).toContain(
      "speed: blistering; strengths: novel-capability"
    );
    expect(() => assertModelEnvConfig()).not.toThrow();
  });
});

describe("catalog config errors", () => {
  test("a missing task-type default fails fast at startup", () => {
    setCatalog([{ id: "composer-2.5", defaultFor: ["worker"] }]);
    expect(() => assertModelEnvConfig()).toThrow(ModelConfigError);
    expect(() => assertModelEnvConfig()).toThrow(
      /no subplanner default.*"defaultFor": \["subplanner"\]/s
    );
  });

  test("assertModelEnvConfig passes when every task type resolves", () => {
    setCatalog([
      { id: "composer-2.5", defaultFor: ["worker"] },
      { slug: "claude-opus-4-8", defaultFor: ["subplanner", "verifier"] },
    ]);
    expect(() => assertModelEnvConfig()).not.toThrow();
  });

  test("malformed JSON and non-arrays are rejected", () => {
    process.env[MODEL_ENV_CATALOG] = "[{id:}]";
    expect(() => effectiveModelCatalog()).toThrow(ModelConfigError);

    process.env[MODEL_ENV_CATALOG] = '{"id":"x"}';
    expect(() => effectiveModelCatalog()).toThrow(/expected a JSON array/);
  });

  test("an entry with neither id nor a known slug is rejected", () => {
    setCatalog([{ slug: "not-a-builtin" }]);
    expect(() => effectiveModelCatalog()).toThrow(/needs an "id"/);

    setCatalog([{ summary: "no id or slug" }]);
    expect(() => effectiveModelCatalog()).toThrow(/needs an "id"/);
  });
});
