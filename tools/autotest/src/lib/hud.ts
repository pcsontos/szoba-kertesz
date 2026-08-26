// hud.ts — a battery SZEMLÉLTETŐ HUD-ja: Playwright-injektált doboz a jobb alsó sarokban,
// ami mutatja, épp melyik eset fut. NEM az app része — minden `goto` törli, ezért fázisonként
// újrarajzoljuk.
//
// Külön modul (#10 PR-review, 14. tétel): a `battery.ts` 617 sor volt, és ebből ~80 tisztán
// prezentáció. A kiemeléssel a futtató-logika olvashatóbb lesz, a HUD pedig önmagában érthető.
import type { Page } from 'playwright';

/** A HUD-hoz használt DOM-felület, MINIMÁLISAN leírva.
 *
 * Miért nem a `DOM` lib? Mert ez a csomag Node-os (`types: ["node"]`), és a teljes DOM-lib
 * megnyitásával egy tiszta lib-modul is hivatkozhatna `document`-re — lefordulna, majd
 * futásidőben bukna. A `page.evaluate` visszahívása a BÖNGÉSZŐBEN fut, a fordító viszont
 * Node-kontextusban látja; ez a shim köti össze a kettőt, láthatóan.
 */
interface HudDocument {
  getElementById(id: string): HudElement | null;
  createElement(tag: string): HudElement;
  readonly body: { appendChild(node: HudElement): void };
}
interface HudElement {
  id: string;
  innerHTML: string;
  setAttribute(name: string, value: string): void;
}

export type HudTone = 'run' | 'ok' | 'fail';

const TONE_COLORS: Readonly<Record<HudTone, string>> = {
  run: '#e0a94b',
  ok: '#4bbd8a',
  fail: '#f06a6a',
};

function escapeHud(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').slice(0, 200);
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * A HUD állapota. Külön objektum, mert a felirat (melyik eset) és a fázis (mi történik épp)
 * két különböző ütemben változik: a felirat esetenként, a fázis másodpercenként.
 */
export class Hud {
  private label = '';
  private sub = '';

  /** `--no-hud` esetén minden művelet néma, és a demó-szünet is elmarad. */
  constructor(private readonly enabled: boolean) {}

  get pauseMs(): number {
    return this.enabled ? 900 : 0;
  }

  setCase(label: string, sub: string): void {
    this.label = label;
    this.sub = sub;
  }

  async show(page: Page, phase: string, tone: HudTone = 'run'): Promise<void> {
    if (!this.enabled) {
      return;
    }
    try {
      await page.evaluate(
        (data: { label: string; sub: string; phase: string; color: string }) => {
          const doc = (globalThis as unknown as { document: HudDocument }).document;
          let box = doc.getElementById('__autotest_hud');
          if (box === null) {
            box = doc.createElement('div');
            box.id = '__autotest_hud';
            doc.body.appendChild(box);
          }
          box.setAttribute(
            'style',
            'position:fixed;bottom:18px;right:18px;z-index:2147483647;width:340px;' +
              "font:13px/1.45 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;" +
              'background:rgba(15,21,18,.96);color:#e6efe9;border:1px solid ' +
              data.color +
              ';border-radius:12px;padding:12px 15px;box-shadow:0 10px 34px rgba(0,0,0,.45);' +
              'pointer-events:none;',
          );
          box.innerHTML =
            '<div style="font-size:11px;letter-spacing:.05em;text-transform:uppercase;' +
            'color:#93a49b;margin-bottom:5px">🎬 autotest · Playwright</div>' +
            `<div style="font-weight:700;margin-bottom:3px">${data.label}</div>` +
            (data.sub === ''
              ? ''
              : `<div style="color:#b9c7bf;font-size:12px;margin-bottom:7px">${data.sub}</div>`) +
            `<div style="color:${data.color};font-weight:600">${data.phase}</div>`;
        },
        {
          label: escapeHud(this.label),
          sub: escapeHud(this.sub),
          phase,
          color: TONE_COLORS[tone],
        },
      );
    } catch {
      // Navigáció közben nincs body — nem kritikus.
    }
  }

  /** Az ítélet kiírása + demó-szünet, hogy a nézők lássák az eredményt. */
  async verdict(page: Page, accepted: boolean): Promise<void> {
    await this.show(page, accepted ? '✓ ELFOGADVA' : '✗ ELUTASÍTVA', accepted ? 'ok' : 'fail');
    if (this.pauseMs > 0) {
      await sleep(this.pauseMs);
    }
  }
}
