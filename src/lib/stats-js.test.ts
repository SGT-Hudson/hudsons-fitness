import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

type BeforeSend = (type: string, payload: { url?: string; referrer?: string } | null) => unknown;

function load(): BeforeSend {
  const win: Record<string, unknown> = {};
  new Function("window", readFileSync(join(process.cwd(), "public/stats.js"), "utf8"))(win);
  return win.hudsnStatsBeforeSend as BeforeSend;
}

describe("public/stats.js", () => {
  const beforeSend = load();

  test("cambia por :id los UUID, los números y los tokens largos con dígitos", () => {
    expect(beforeSend("event", { url: "/recipes/0b7e5d2a-1c3f-4e8a-9b6d-2f4a8c1e7d90" })).toEqual({ url: "/recipes/:id" });
    expect(beforeSend("event", { url: "/workouts/42" })).toEqual({ url: "/workouts/:id" });
  });

  test("deja las rutas con palabras largas sin dígitos", () => {
    expect(beforeSend("event", { url: "/onboarding" })).toEqual({ url: "/onboarding" });
    expect(beforeSend("event", { url: "/configuracion-avanzada" })).toEqual({ url: "/configuracion-avanzada" });
  });

  test("conserva el origen, quita parámetros y # y limpia la procedencia", () => {
    expect(
      beforeSend("event", {
        url: "https://fit.hudsn.app/auth/confirm?token_hash=abc#x",
        referrer: "https://fit.hudsn.app/recipes/0b7e5d2a-1c3f-4e8a-9b6d-2f4a8c1e7d90",
      }),
    ).toEqual({ url: "https://fit.hudsn.app/auth/confirm", referrer: "https://fit.hudsn.app/recipes/:id" });
  });
});
