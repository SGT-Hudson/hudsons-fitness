import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

type Payload = { url?: string; referrer?: string; id?: string };
type BeforeSend = (type: string, payload: Payload | null) => Promise<Payload | null>;
type Identify = (value: string | null | Promise<string | null>) => void;

function load(): { beforeSend: BeforeSend; identify: Identify } {
  const win: Record<string, unknown> = {};
  new Function("window", readFileSync(join(process.cwd(), "public/stats.js"), "utf8"))(win);
  return { beforeSend: win.hudsnStatsBeforeSend as BeforeSend, identify: win.hudsnStatsIdentify as Identify };
}

describe("public/stats.js", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  describe("limpieza de rutas", () => {
    test("cambia por :id los UUID, los números y los tokens largos con dígitos", async () => {
      const { beforeSend, identify } = load();
      identify(null);
      expect(await beforeSend("event", { url: "/recipes/0b7e5d2a-1c3f-4e8a-9b6d-2f4a8c1e7d90" })).toEqual({ url: "/recipes/:id" });
      expect(await beforeSend("event", { url: "/workouts/42" })).toEqual({ url: "/workouts/:id" });
    });

    test("deja las rutas con palabras largas sin dígitos", async () => {
      const { beforeSend, identify } = load();
      identify(null);
      expect(await beforeSend("event", { url: "/onboarding" })).toEqual({ url: "/onboarding" });
      expect(await beforeSend("event", { url: "/configuracion-avanzada" })).toEqual({ url: "/configuracion-avanzada" });
    });

    test("conserva el origen, quita parámetros y # y limpia la procedencia", async () => {
      const { beforeSend, identify } = load();
      identify(null);
      expect(
        await beforeSend("event", {
          url: "https://fit.hudsn.app/auth/confirm?token_hash=abc#x",
          referrer: "https://fit.hudsn.app/recipes/0b7e5d2a-1c3f-4e8a-9b6d-2f4a8c1e7d90",
        }),
      ).toEqual({ url: "https://fit.hudsn.app/auth/confirm", referrer: "https://fit.hudsn.app/recipes/:id" });
    });
  });

  describe("identidad", () => {
    test("no resuelve antes de la primera hudsnStatsIdentify", async () => {
      const { beforeSend, identify } = load();
      const done = vi.fn();
      void beforeSend("event", { url: "/" }).then(done);
      await vi.advanceTimersByTimeAsync(2999);
      expect(done).not.toHaveBeenCalled();
      identify("abc");
      await vi.advanceTimersByTimeAsync(0);
      expect(done).toHaveBeenCalledTimes(1);
    });

    test("con una cadena pone payload.id", async () => {
      const { beforeSend, identify } = load();
      identify("abc");
      expect((await beforeSend("event", { url: "/" }))?.id).toBe("abc");
    });

    test("con null resuelve sin id aunque el payload lo trajera", async () => {
      const { beforeSend, identify } = load();
      identify(null);
      expect(await beforeSend("event", { url: "/", id: "viejo" })).not.toHaveProperty("id");
    });

    test("sin llamada, a los 3000 ms resuelve sin id", async () => {
      const { beforeSend } = load();
      const p = beforeSend("event", { url: "/", id: "viejo" });
      await vi.advanceTimersByTimeAsync(3000);
      expect(await p).not.toHaveProperty("id");
    });

    test("con una promesa da su valor; rechazada, sin id", async () => {
      const { beforeSend, identify } = load();
      identify(Promise.resolve("x"));
      expect((await beforeSend("event", { url: "/" }))?.id).toBe("x");
      identify(Promise.reject(new Error("no")));
      expect(await beforeSend("event", { url: "/", id: "y" })).not.toHaveProperty("id");
    });

    test("una identidad que llega tras los 3000 ms la llevan los envíos siguientes", async () => {
      const { beforeSend, identify } = load();
      const first = beforeSend("event", { url: "/" });
      await vi.advanceTimersByTimeAsync(3000);
      expect(await first).not.toHaveProperty("id");
      identify("tarde");
      expect((await beforeSend("event", { url: "/" }))?.id).toBe("tarde");
    });

    test("iniciar y cerrar sesión ('abc' y luego null) quita el id", async () => {
      const { beforeSend, identify } = load();
      identify("abc");
      expect((await beforeSend("event", { url: "/" }))?.id).toBe("abc");
      identify(null);
      expect(await beforeSend("event", { url: "/", id: "abc" })).not.toHaveProperty("id");
    });

    test("una promesa rechazada y sustituida no deja un rechazo sin atender", async () => {
      const { identify } = load();
      const unhandled = vi.fn();
      process.on("unhandledRejection", unhandled);
      identify(Promise.reject(new Error("no")));
      identify(null);
      vi.useRealTimers();
      await new Promise((r) => setTimeout(r, 20));
      process.off("unhandledRejection", unhandled);
      expect(unhandled).not.toHaveBeenCalled();
    });
  });
});
