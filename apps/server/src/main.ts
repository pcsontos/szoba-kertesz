import { join } from 'node:path';
import { loadConfig, setWatchLog } from '@szoba-kertesz/core';
import { createApp } from './app.js';

// main.ts — a BOOT. Két dolgot csinál, amit az app.ts szándékosan nem:
// betölti/ellenőrzi a környezetet, és lefoglalja a portot.

// .env betöltése a belépési pontban (a core sosem tölt fájlt) — hiányzó .env
// tolerálva, mert az env jöhet közvetlenül a shellből is.
try {
  process.loadEnvFile();
} catch (error) {
  const isMissingEnvFile =
    error instanceof Error &&
    (error as NodeJS.ErrnoException).code === 'ENOENT';
  if (!isMissingEnvFile) {
    throw error;
  }
}

// FAIL-FAST: szerverként a hiányzó API-kulcs egyébként csak az ELSŐ kérésnél
// derülne ki. A loadConfig sima Error-t dob magyar üzenettel (config.ts) —
// külön hibaosztály nincs, és nem is kell.
try {
  loadConfig();
} catch (error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`szobakertész szerver: ${message}`);
  process.exit(1);
}

// A perzisztencia a szerver ALAPFUNKCIÓJA: enélkül a /api/chat MINDEN kérésnél
// elhasalna. Ezért itt, indításkor derüljön ki, ne az első üzenetnél. A config.ts
// szándékosan OPCIONÁLISNAK veszi ezt a változót — a CLI egylövetű `ask` parancsa
// nem perzisztál, tehát annak tényleg nem kell.
if (!process.env['DATABASE_URL_CHAT']) {
  console.error(
    'szobakertész szerver: hiányzó DATABASE_URL_CHAT — a beszélgetés-tár (threads + ' +
      'messages) ezen a kapcsolaton megy, a szoba-kertesz_chat szerepen. Vedd fel a .env fájlba.',
  );
  process.exit(1);
}

// A KAPU élesben KÖTELEZŐ. Ha csak "van env → véd" logika lenne, egy elfelejtett változó
// NÉMÁN kapcsolná ki a védelmet egy publikus URL-en — és a /api/chat valódi pénzt költ.
// Ugyanaz a fail-fast minta, mint fent: magyar üzenet, exit 1.
const isProduction = process.env.NODE_ENV === 'production';
const authUser = process.env['BASIC_AUTH_USER'];
const authPassword = process.env['BASIC_AUTH_PASSWORD'];

if (isProduction && (!authUser || !authPassword)) {
  console.error(
    'szobakertész szerver: hiányzó BASIC_AUTH_USER / BASIC_AUTH_PASSWORD — élesben ' +
      '(NODE_ENV=production) a szerver nem indul kapuzás nélkül. A /api/chat hitelesítés ' +
      'nélkül valódi pénzt költ, a /api/threads pedig minden beszélgetést kiadna.',
  );
  process.exit(1);
}

// A folyamatos "control room" log — UGYANAZ a fájl, mint a CLI-nél (tail -f).
setWatchLog(join(process.cwd(), 'logs', 'agent.log'));

const port = Number(process.env.PORT ?? 3000);

createApp({
  auth: authUser && authPassword
    ? { user: authUser, password: authPassword }
    : undefined,
  chatRateLimit: {
    windowMs: Number(process.env['CHAT_RATE_WINDOW_MS'] ?? 60_000),
    limit: Number(process.env['CHAT_RATE_LIMIT'] ?? 20),
  },
}).listen(port, () => {
  console.log(`szobakertész szerver: http://localhost:${port}/api/chat`);
});
