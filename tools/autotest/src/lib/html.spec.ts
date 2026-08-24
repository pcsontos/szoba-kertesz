import { describe, expect, it } from 'vitest';
import { bar, chatThread, esc, htmlDocument, md, mdInline } from './html.js';

describe('esc', () => {
  it('a négy veszélyes karaktert escape-eli', () => {
    expect(esc('<a href="x">&</a>')).toBe('&lt;a href=&quot;x&quot;&gt;&amp;&lt;/a&gt;');
  });

  it('az & escape-elése nem duplázódik', () => {
    expect(esc('a & <b>')).toBe('a &amp; &lt;b&gt;');
  });
});

describe('mdInline', () => {
  it('félkövér, dőlt és kód', () => {
    expect(mdInline('**a** *b* `c`')).toBe('<strong>a</strong> <em>b</em> <code>c</code>');
  });
});

describe('md', () => {
  it('címsorból h3-at csinál (h1 a riport sajátja)', () => {
    expect(md('# Cím')).toContain('<h3>Cím</h3>');
  });

  it('felsorolást ul-lé alakít', () => {
    expect(md('- egy\n- kettő')).toBe('<ul><li>egy</li><li>kettő</li></ul>');
  });

  it('táblázatot épít fejléccel és törzzsel', () => {
    const html = md('| név | ár |\n|---|---|\n| Bazsalikom | 990 |');
    expect(html).toContain('<th>név</th>');
    expect(html).toContain('<td>Bazsalikom</td>');
    expect(html).toContain('tbl-wrap'); // vízszintesen görgethető konténer
  });

  it('a HTML-t escape-eli, mielőtt markdownt keresne', () => {
    expect(md('<script>alert(1)</script>')).toContain('&lt;script&gt;');
    expect(md('<script>alert(1)</script>')).not.toContain('<script>');
  });

  it('üres bemenetre látható jelzést ad, nem üres stringet', () => {
    expect(md('')).toBe('<em>üres</em>');
  });
});

describe('chatThread', () => {
  it('egykörös esetnél egy user és egy bot buborék', () => {
    const html = chatThread('Hány kaktusz van?', '3 kaktusz van.');
    expect(html).toContain('msg user');
    expect(html).toContain('msg bot');
    expect((html.match(/msg user/g) ?? []).length).toBe(1);
  });

  it('többkörös átiratot körökre bont a 👤 marker mentén', () => {
    const transcript = '👤 Első\n🤖 Válasz egy\n\n👤 Második\n🤖 Válasz kettő';
    const html = chatThread('n/a', transcript);
    expect((html.match(/msg user/g) ?? []).length).toBe(2);
    expect((html.match(/msg bot/g) ?? []).length).toBe(2);
  });
});

describe('bar', () => {
  it('a 0..1 arányt százalékos szélességgé alakítja', () => {
    expect(bar(0.5)).toContain('width:50%');
  });

  it('a tartományon kívüli értéket levágja', () => {
    expect(bar(1.7)).toContain('width:100%');
    expect(bar(-2)).toContain('width:0%');
  });

  it('NaN-nál nem ír szélességet, hanem "n/a"-t jelez', () => {
    expect(bar(Number.NaN)).toContain('n/a');
  });
});

describe('htmlDocument', () => {
  const doc = htmlDocument('Teszt-riport', '<p>törzs</p>');

  it('a címet a title-be teszi', () => {
    expect(doc).toContain('<title>Teszt-riport</title>');
  });

  it('a világos palettát a csupasz :root-on definiálja', () => {
    expect(doc).toMatch(/:root\s*\{[^}]*--bg:/);
  });

  it('sötét témára is ad palettát', () => {
    expect(doc).toContain('prefers-color-scheme: dark');
  });

  it('a body háttere EXPLICIT token, nem átlátszó', () => {
    expect(doc).toMatch(/body\s*\{[^}]*background:\s*var\(--bg\)/);
  });

  it('self-contained: nincs külső hivatkozás', () => {
    expect(doc).not.toMatch(/https?:\/\//);
  });
});
