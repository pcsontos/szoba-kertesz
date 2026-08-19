// knowledge-document.ts — a korpusz EGY fájljának feldolgozása: front matter + tisztítás.
//
// A valós korpusz tisztítása a RAG munka javát teszi ki. A cikkek végén BOLTI ZAJ van
// (termék-ajánló blokk, szerzői aláírás) — ez NEM tudás: ha bekerülne a tudásbázisba,
// a keresés termékreklámot találna a gondozási kérdésre.

export interface KnowledgeDocument {
  /** A cikk URL-je a front matterből — EZT idézi vissza az agent (grounding). */
  source: string;
  title: string;
  category: string;
  /** A tisztított törzs — ezt darabolja a chunkMarkdown. */
  body: string;
}

/** A bolti blokkok címsorai. Innentől a fájl végéig minden reklám, nem tudás. */
const SHOP_NOISE_HEADINGS =
  /\n#+\s*(Perfect Pairings|Words By The Sill|Shop |Related Posts)[\s\S]*$/i;

export function stripShopNoise(body: string): string {
  return body.replace(SHOP_NOISE_HEADINGS, '').trim();
}

/** A markdown fejléc (front matter) kiolvasása: innen jön a forrás-URL és a cím. */
export function parseKnowledgeDocument(
  markdown: string,
  fallbackTitle: string,
): KnowledgeDocument {
  const match = markdown.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) {
    return {
      source: '',
      title: fallbackTitle,
      category: 'egyéb',
      body: stripShopNoise(markdown),
    };
  }

  const [, frontMatter, body] = match;
  const field = (name: string): string =>
    frontMatter?.match(new RegExp(`^${name}:\\s*(.+)$`, 'm'))?.[1]?.trim() ?? '';

  return {
    source: field('source'),
    title: field('title') || fallbackTitle,
    category: field('category') || 'egyéb',
    body: stripShopNoise(body ?? ''),
  };
}
