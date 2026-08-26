// html.ts — a két riport-generátor KÖZÖS HTML-építői. Előre kivonva, mert a kurzus
// tapasztalata szerint különben duplikálódnak és divergálnak (ott 122 + 71 sort kellett
// utólag kiemelni). Self-contained: se külső CSS, se külső JS, se távoli kép.
import { spawn } from 'node:child_process';
import { platform } from 'node:process';

export function esc(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Inline markdown a MÁR escape-elt szövegen. */
export function mdInline(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`(.+?)`/g, '<code>$1</code>');
}

function splitRow(line: string): string[] {
  return line
    .trim()
    .replace(/^\||\|$/g, '')
    .split('|')
    .map((cell) => cell.trim());
}

/**
 * Mini markdown → HTML: címsor, lista, TÁBLÁZAT, inline formázás. Táblázat azért kell, mert az
 * agent válaszai gyakran táblázatosak, és a riportban úgy kell kinézniük, mint a chatben.
 * Az escape ELÖL fut — utána már biztonságos markereket keresni.
 */
export function md(source: string): string {
  const lines = esc(source).split('\n');
  let html = '';
  let inUnordered = false;
  let inOrdered = false;

  const closeLists = (): void => {
    if (inUnordered) {
      html += '</ul>';
      inUnordered = false;
    }
    if (inOrdered) {
      html += '</ol>';
      inOrdered = false;
    }
  };
  const isRow = (line: string): boolean => line.includes('|');
  const isSeparator = (line: string): boolean =>
    /^\s*\|?[\s:|-]+\|?\s*$/.test(line) && line.includes('-');

  let index = 0;
  while (index < lines.length) {
    const line = lines[index] ?? '';
    const trimmed = line.trim();
    if (trimmed === '') {
      closeLists();
      index++;
      continue;
    }

    if (isRow(line) && index + 1 < lines.length && isSeparator(lines[index + 1] ?? '')) {
      closeLists();
      const header = splitRow(line);
      index += 2;
      const body: string[][] = [];
      while (
        index < lines.length &&
        (lines[index] ?? '').trim() !== '' &&
        isRow(lines[index] ?? '')
      ) {
        body.push(splitRow(lines[index] ?? ''));
        index++;
      }
      html +=
        '<div class="tbl-wrap"><table><thead><tr>' +
        header.map((cell) => `<th>${mdInline(cell)}</th>`).join('') +
        '</tr></thead><tbody>' +
        body
          .map(
            (row) => '<tr>' + row.map((cell) => `<td>${mdInline(cell)}</td>`).join('') + '</tr>',
          )
          .join('') +
        '</tbody></table></div>';
      continue;
    }

    const heading = trimmed.match(/^(#{1,4})\s+(.*)/);
    const bullet = trimmed.match(/^[-*]\s+(.*)/);
    const numbered = trimmed.match(/^\d+\.\s+(.*)/);

    if (heading !== null) {
      closeLists();
      const level = Math.min(6, (heading[1] ?? '').length + 2);
      html += `<h${level}>${mdInline(heading[2] ?? '')}</h${level}>`;
    } else if (bullet !== null) {
      if (inOrdered) {
        closeLists();
      }
      if (!inUnordered) {
        html += '<ul>';
        inUnordered = true;
      }
      html += `<li>${mdInline(bullet[1] ?? '')}</li>`;
    } else if (numbered !== null) {
      if (inUnordered) {
        closeLists();
      }
      if (!inOrdered) {
        html += '<ol>';
        inOrdered = true;
      }
      html += `<li>${mdInline(numbered[1] ?? '')}</li>`;
    } else {
      closeLists();
      html += `<p>${mdInline(trimmed)}</p>`;
    }
    index++;
  }
  closeLists();
  return html === '' ? '<em>üres</em>' : html;
}

/** A teljes beszélgetés chat-nézetben. A többkörös átirat 👤/🤖 markerek mentén bomlik körökre. */
export function chatThread(question: string, answer: string): string {
  const turns: { user: string; bot: string }[] = [];
  if (answer.includes('👤')) {
    for (const chunk of answer
      .split('👤 ')
      .map((part) => part.trim())
      .filter((part) => part !== '')) {
      const [user, ...botParts] = chunk.split('🤖');
      turns.push({ user: (user ?? '').trim(), bot: botParts.join('🤖').trim() });
    }
  } else {
    turns.push({ user: question, bot: answer });
  }
  const bubbles = turns
    .map(
      (turn) =>
        (turn.user === '' ? '' : `<div class="msg user">${esc(turn.user)}</div>`) +
        `<div class="msg bot"><div class="rendered">${md(turn.bot)}</div></div>`,
    )
    .join('');
  return `<div class="chat">${bubbles}</div>`;
}

/** 0..1 arány vízszintes sávként. NaN = nem mért érték — LÁTHATÓAN, nem 0%-ként. */
export function bar(ratio: number, tone: 'good' | 'bad' = 'good'): string {
  if (Number.isNaN(ratio)) {
    return '<span class="bar-na">n/a</span>';
  }
  const percent = Math.round(Math.min(1, Math.max(0, ratio)) * 100);
  return (
    `<span class="bar ${tone}"><span class="bar-fill" style="width:${percent}%"></span></span>` +
    `<span class="bar-num">${percent}%</span>`
  );
}

/**
 * A self-contained dokumentum-váz. A világos paletta a CSUPASZ `:root`-on él; sötétben csak a
 * tokenek íródnak felül. A `body` háttere explicit token — átlátszó törzs a böngésző hátterét
 * kölcsönözné, és a riport olvashatatlan lenne sötét témában.
 */
export function htmlDocument(title: string, body: string): string {
  return `<!doctype html>
<html lang="hu">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<style>
:root {
  --bg: #f7f9f7; --fg: #16211b; --muted: #5c6b62; --card: #ffffff;
  --line: #d9e2dc; --ok: #2f8f63; --bad: #c2453f; --accent: #1f6f4a;
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #0f1512; --fg: #e6efe9; --muted: #93a49b; --card: #16201b;
    --line: #27352d; --ok: #4bbd8a; --bad: #f06a6a; --accent: #6fd3a3;
  }
}
* { box-sizing: border-box; }
body {
  margin: 0; padding: 2rem 1.25rem; background: var(--bg); color: var(--fg);
  font: 15px/1.6 -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
}
main { max-width: 62rem; margin: 0 auto; }
h1 { font-size: 1.6rem; margin: 0 0 .25rem; }
h2 { font-size: 1.2rem; margin: 2rem 0 .5rem; color: var(--accent); }
.card { background: var(--card); border: 1px solid var(--line); border-radius: 12px; padding: 1rem 1.15rem; margin: .75rem 0; }
.muted { color: var(--muted); font-size: .9rem; }
.tbl-wrap { overflow-x: auto; }
table { border-collapse: collapse; width: 100%; font-size: .92rem; }
th, td { border: 1px solid var(--line); padding: .35rem .55rem; text-align: left; vertical-align: top; }
th { background: color-mix(in srgb, var(--accent) 12%, transparent); }
code { background: color-mix(in srgb, var(--fg) 8%, transparent); padding: .05rem .3rem; border-radius: 4px; }
pre { overflow-x: auto; }
.chat { display: flex; flex-direction: column; gap: .5rem; }
.msg { max-width: 80%; padding: .5rem .75rem; border-radius: 10px; }
.msg.user { align-self: flex-end; background: var(--accent); color: #fff; }
.msg.bot { align-self: flex-start; background: color-mix(in srgb, var(--fg) 7%, transparent); }
.bar { display: inline-block; width: 8rem; height: .6rem; border-radius: 999px; background: color-mix(in srgb, var(--fg) 12%, transparent); overflow: hidden; vertical-align: middle; }
.bar-fill { display: block; height: 100%; background: var(--ok); }
.bar.bad .bar-fill { background: var(--bad); }
.bar-num { font-variant-numeric: tabular-nums; margin-left: .4rem; font-size: .85rem; }
.bar-na { color: var(--muted); font-style: italic; }
.ok { color: var(--ok); } .bad { color: var(--bad); }
details > summary { cursor: pointer; }
</style>
</head>
<body><main>${body}</main></body>
</html>`;
}

/** A riport megnyitása az OS böngészőjében — fire-and-forget, headless CI-ben nem kritikus. */
export function openInBrowser(path: string): void {
  const opener = platform === 'darwin' ? 'open' : platform === 'win32' ? 'start' : 'xdg-open';
  try {
    const child = spawn(opener, [path], {
      detached: true,
      stdio: 'ignore',
      shell: platform === 'win32',
    });
    child.unref();
  } catch {
    // Headless környezetben nincs böngésző — nem hiba.
  }
}
