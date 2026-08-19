import { describe, expect, it } from 'vitest';
import { parseKnowledgeDocument, stripShopNoise } from './knowledge-document.js';

/**
 * A korpusz-tisztítás tesztjei. Ez a RAG munka java: a valós dokumentumokban
 * bolti zaj van (termék-ajánló blokk, szerzői aláírás), ami NEM tudás — ha
 * bekerülne, a gondozási kérdésre termékreklámot találna a keresés.
 */

const DOCUMENT = `---
title: The Hole Truth: Monsteras
source: https://www.thesill.com/blogs/plants-101/why-swiss-cheese-plant-has-holes
category: plants-101
---

# The Hole Truth: Monsteras

Monsteras are famous for their natural leaf holes.

## Perfect Pairings

Shop our best-selling planters today!
`;

describe('knowledge-document', () => {
  it('kiolvassa a front mattert: cím, forrás-URL, kategória', () => {
    const document = parseKnowledgeDocument(DOCUMENT, 'tartalék-cím');

    expect(document.title).toBe('The Hole Truth: Monsteras');
    expect(document.source).toBe(
      'https://www.thesill.com/blogs/plants-101/why-swiss-cheese-plant-has-holes',
    );
    expect(document.category).toBe('plants-101');
  });

  it('a bolti zajt levágja a törzsből — a tudás megmarad', () => {
    const document = parseKnowledgeDocument(DOCUMENT, 'tartalék-cím');

    expect(document.body).toContain('natural leaf holes');
    expect(document.body).not.toContain('Perfect Pairings');
    expect(document.body).not.toContain('best-selling planters');
  });

  it('front matter nélkül a tartalék-címmel és "egyéb" kategóriával dolgozik', () => {
    const document = parseKnowledgeDocument(
      '# Csak egy cím\n\nSzöveg.',
      'fajl-neve',
    );

    expect(document.title).toBe('fajl-neve');
    expect(document.category).toBe('egyéb');
    expect(document.source).toBe('');
    expect(document.body).toContain('Szöveg.');
  });

  it('a stripShopNoise a "Words By The Sill" aláírást is levágja', () => {
    const cleaned = stripShopNoise(
      'Hasznos tudás.\n\n### Words By The Sill\n\nAláírás és reklám.',
    );

    expect(cleaned).toBe('Hasznos tudás.');
  });
});
