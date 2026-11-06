import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { identify, pseudonym, track } from "./stats";

const ID = "3f1c2a9e-5b7d-4e8f-9a0b-1c2d3e4f5a6b";

type Win = { umami?: unknown; hudsnStatsIdentify?: unknown };

function setup(win: Win = {}, script?: EventTarget) {
  vi.stubGlobal("window", win);
  vi.stubGlobal("document", { getElementById: (id: string) => (id === "hudsn-stats" ? (script ?? null) : null) });
  return win;
}

beforeEach(() => {
  setup();
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("pseudonym", () => {
  test("vector de hfit", async () => {
    expect(await pseudonym(ID)).toBe("19729b10e081a79d");
  });

  test("null sin crypto.subtle", async () => {
    vi.stubGlobal("crypto", {});
    expect(await pseudonym(ID)).toBeNull();
  });
});

describe("identify", () => {
  test("identify('uid') pasa a hudsnStatsIdentify una promesa con el seudónimo", async () => {
    const fn = vi.fn();
    setup({ hudsnStatsIdentify: fn });
    identify(ID);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(await fn.mock.calls[0][0]).toBe("19729b10e081a79d");
  });

  test("identify(null) la llama con null", () => {
    const fn = vi.fn();
    setup({ hudsnStatsIdentify: fn });
    identify(null);
    expect(fn).toHaveBeenCalledWith(null);
  });

  test("sin hudsnStatsIdentify no lanza", () => {
    expect(() => identify(ID)).not.toThrow();
    expect(() => identify(null)).not.toThrow();
  });

  test("si hudsnStatsIdentify lanza, no se propaga", () => {
    setup({
      hudsnStatsIdentify: () => {
        throw new Error("x");
      },
    });
    expect(() => identify(ID)).not.toThrow();
  });
});

describe("track", () => {
  test("sin umami ni script no lanza", () => {
    expect(() => track("x")).not.toThrow();
  });

  test("con umami.track lo llama con los argumentos", () => {
    const t = vi.fn();
    setup({ umami: { track: t } });
    track("x", { a: "b" });
    expect(t).toHaveBeenCalledWith("x", { a: "b" });
  });

  test("sin umami y con script: espera a su load y llama una vez", () => {
    const script = new EventTarget();
    const win = setup({}, script);
    track("x");
    const t = vi.fn();
    win.umami = { track: t };
    expect(t).not.toHaveBeenCalled();
    script.dispatchEvent(new Event("load"));
    script.dispatchEvent(new Event("load"));
    expect(t).toHaveBeenCalledTimes(1);
    expect(t).toHaveBeenCalledWith("x");
  });

  test("si umami.track lanza, no se propaga", () => {
    setup({
      umami: {
        track: () => {
          throw new Error("x");
        },
      },
    });
    expect(() => track("x")).not.toThrow();
  });
});
