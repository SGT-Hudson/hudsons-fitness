// Analítica propia y anónima (Umami en stats.hudsn.app, hudsn-ops). No guarda nada en el dispositivo:
// el seudónimo de la cuenta vive en memoria (public/stats.js) y se quita al cerrar sesión.
// El id del <script> no puede ser «umami»: el navegador expone los ids como globales y window.umami
// sería la etiqueta, no el tracker. Por eso se mira que track sea una función.
// No importa @/lib/supabase: lanza sin variables de entorno y se mockea en todos los tests.
type Umami = { track: (...args: unknown[]) => unknown };
type StatsWindow = {
  umami?: Partial<Umami>;
  hudsnStatsIdentify?: (value: string | null | Promise<string | null>) => void;
};

const win = () => window as unknown as StatsWindow;

const tracker = (): Umami | undefined => {
  const umami = win().umami;
  return typeof umami?.track === 'function' ? (umami as Umami) : undefined;
};

// Si el script no ha cargado aún se espera a su `load`; si está bloqueado, no pasa nada.
export function track(name: string, data?: Record<string, string>): void {
  const run = () => {
    try {
      tracker()?.track(...(data === undefined ? [name] : [name, data]));
    } catch {
      // La analítica nunca rompe la app.
    }
  };
  try {
    if (tracker()) return run();
    document.getElementById('hudsn-stats')?.addEventListener('load', run, { once: true });
  } catch {
    // La analítica nunca rompe la app.
  }
}

// 16 primeros hex de sha256("hudsn:hfit:" + accountId); null sin crypto.subtle (contexto no seguro).
export async function pseudonym(accountId: string): Promise<string | null> {
  try {
    const subtle = typeof crypto !== 'undefined' ? crypto.subtle : undefined;
    if (!subtle) return null;
    const digest = await subtle.digest('SHA-256', new TextEncoder().encode(`hudsn:hfit:${accountId}`));
    return Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')
      .slice(0, 16);
  } catch {
    return null;
  }
}

// Pasa la promesa sin esperarla: stats.js la resuelve antes de cada envío.
export function identify(accountId: string | null): void {
  try {
    win().hudsnStatsIdentify?.(accountId ? pseudonym(accountId) : null);
  } catch {
    // La analítica nunca rompe la app.
  }
}
