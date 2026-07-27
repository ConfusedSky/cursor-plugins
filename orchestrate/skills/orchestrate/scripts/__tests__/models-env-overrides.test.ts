import { afterEach, describe, expect, test } from "bun:test";

import {
  DEFAULT_ROOT_MODEL,
  defaultModelForType,
  defaultRootModel,
  effectiveDefaultLabelForType,
  formatModelSelectionLabel,
  isKnownModel,
  looksLikeSelectionJson,
  MODEL_ENV_BY_TYPE,
  MODEL_ENV_ROOT,
  parseModelSelectionJson,
  renderModelCatalog,
  resolveModelSelection,
} from "../models.ts";

const ENV_KEYS = [
  MODEL_ENV_BY_TYPE.worker,
  MODEL_ENV_BY_TYPE.subplanner,
  MODEL_ENV_BY_TYPE.verifier,
  MODEL_ENV_ROOT,
] as const;

const savedEnv: Record<string, string | undefined> = {};

function clearModelEnv(): void {
  for (const key of ENV_KEYS) {
    if (!(key in savedEnv)) savedEnv[key] = process.env[key];
    delete process.env[key];
  }
}

afterEach(() => {
  for (const key of ENV_KEYS) {
    const prior = savedEnv[key];
    if (prior === undefined) delete process.env[key];
    else process.env[key] = prior;
    delete savedEnv[key];
  }
});

describe("env model overrides", () => {
  test("defaultModelForType uses catalog when env unset", () => {
    clearModelEnv();
    expect(defaultModelForType("worker")).toBe("gpt-5.5-high-fast");
    expect(defaultModelForType("subplanner")).toBe(
      "claude-opus-4-8-thinking-xhigh"
    );
    expect(defaultModelForType("verifier")).toBe("claude-opus-4-8");
  });

  test("catalog slug in env overrides defaultFor", () => {
    clearModelEnv();
    process.env.ORCHESTRATE_MODEL_WORKER = "composer-2-fast";
    expect(defaultModelForType("worker")).toBe("composer-2-fast");
    expect(resolveModelSelection(defaultModelForType("worker"))).toEqual({
      id: "composer-2",
      params: [{ id: "fast", value: "true" }],
    });
    // Other roles untouched.
    expect(defaultModelForType("verifier")).toBe("claude-opus-4-8");
  });

  test("whitespace-only env is treated as unset", () => {
    clearModelEnv();
    process.env.ORCHESTRATE_MODEL_WORKER = "   ";
    expect(defaultModelForType("worker")).toBe("gpt-5.5-high-fast");
  });

  test("bare unknown id in env passes through to { id }", () => {
    clearModelEnv();
    process.env.ORCHESTRATE_MODEL_WORKER = "composer-2.5";
    const spec = defaultModelForType("worker");
    expect(spec).toBe("composer-2.5");
    expect(isKnownModel(spec)).toBe(false);
    expect(resolveModelSelection(spec)).toEqual({ id: "composer-2.5" });
  });

  test("JSON ModelSelection in env resolves with params", () => {
    clearModelEnv();
    process.env.ORCHESTRATE_MODEL_WORKER =
      '{"id":"composer-2.5","params":[{"id":"fast","value":"true"}]}';
    const spec = defaultModelForType("worker");
    expect(looksLikeSelectionJson(spec)).toBe(true);
    expect(resolveModelSelection(spec)).toEqual({
      id: "composer-2.5",
      params: [{ id: "fast", value: "true" }],
    });
  });

  test("JSON ModelSelection without params is valid", () => {
    clearModelEnv();
    process.env.ORCHESTRATE_MODEL_SUBPLANNER = '{"id":"grok-4-5"}';
    expect(resolveModelSelection(defaultModelForType("subplanner"))).toEqual({
      id: "grok-4-5",
    });
  });

  test("invalid JSON ModelSelection throws a clear error", () => {
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
    clearModelEnv();
    expect(defaultRootModel()).toBe(DEFAULT_ROOT_MODEL);
    process.env.ORCHESTRATE_MODEL_ROOT = "composer-2-fast";
    expect(defaultRootModel()).toBe("composer-2-fast");
    process.env.ORCHESTRATE_MODEL_ROOT = '{"id":"composer-2.5"}';
    expect(resolveModelSelection(defaultRootModel())).toEqual({
      id: "composer-2.5",
    });
  });

  test("renderModelCatalog reflects catalog-slug env defaults", () => {
    clearModelEnv();
    process.env.ORCHESTRATE_MODEL_WORKER = "composer-2-fast";
    const text = renderModelCatalog();
    expect(text).toContain("`composer-2-fast` —");
    expect(text).toContain("(default for worker)");
    // Former worker default should no longer claim worker.
    const gptLine = text
      .split("\n")
      .find(l => l.includes("`gpt-5.5-high-fast`"));
    expect(gptLine).toBeDefined();
    expect(gptLine).not.toContain("default for worker");
  });

  test("renderModelCatalog lists non-catalog env overrides separately", () => {
    clearModelEnv();
    process.env.ORCHESTRATE_MODEL_WORKER = '{"id":"composer-2.5"}';
    const text = renderModelCatalog();
    expect(text).toContain("Env default overrides");
    expect(text).toContain("worker: `composer-2.5`");
    expect(text).toContain("ORCHESTRATE_MODEL_WORKER");
  });

  test("effectiveDefaultLabelForType formats JSON selections", () => {
    clearModelEnv();
    process.env.ORCHESTRATE_MODEL_VERIFIER =
      '{"id":"claude-opus-4-8","params":[{"id":"effort","value":"high"}]}';
    expect(effectiveDefaultLabelForType("verifier")).toBe(
      "claude-opus-4-8 (effort=high)"
    );
    expect(
      formatModelSelectionLabel({
        id: "composer-2.5",
        params: [{ id: "fast", value: "true" }],
      })
    ).toBe("composer-2.5 (fast=true)");
  });
});
