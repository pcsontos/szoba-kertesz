// chunk.ts — a DARABOLÁS. A RAG első döntése, és a leggyakrabban elrontott.
//
// MIÉRT NEM az egész dokumentumot embeddeljük?
//   - Egy vektor EGY jelentést hordoz. Egy 5000 karakteres cikk húsz dologról szól →
//     az "átlagvektora" egyikről sem szól rendesen ("jelentés-elmosódás").
//   - A találatot a modellnek is oda kell adni. Ha az egész cikk megy be, tele a kontextus
//     zajjal, és fizetsz érte minden kérdésnél.
//
// A SZABÁLY, amit követünk: a darabhatár SOHA ne vágjon ketté egy gondolatot.
// Ezért nem karakterre vágunk, hanem a SZERZŐ TAGOLÁSÁT követjük:
//   1. ALCÍMNÉL (## / ###) mindig új darab kezdődik — a szakasz egy gondolati egység,
//   2. a szakaszon belül BEKEZDÉSEKET pakolunk egymás mellé, amíg elférnek a méretkeretben.
//
// OVERLAP (átfedés): az utolsó bekezdést átvisszük a következő darabba, mert a határon
// álló mondat kontextusa különben elveszne ("Ezt hetente ismételd." — mit is?).
//
// CÍMSOR-ÚTVONAL (HF3) — a korpuszból következő döntés, nem általános jó tanács.
// A 202 cikkből 112 azonos szerkezetű: h1 = a növény neve, h2 = Sunlight / Water /
// Humidity / Temperature / Soil / Common Problems. MÉRVE (2026-08-20, a 202 fájlon):
// 54 cikkben van külön "Water" szakasz-címsor, 56-ban "Humidity", 53-ban "Sunlight" —
// és a NÖVÉNY NEVE egyikben sincs benne. A SZINT viszont nem egységes: a korpusz
// leggyakoribb címsorszintje az h5 (607 db), a "## Water" alak csak 14 cikkben áll így;
// ezért nem szintre szűrünk, hanem a tényleges címsor-hierarchiát követjük. A darabok
// 43%-ából hiányzik a saját cikkük címének kulcsszava (1157/2041 — a levezetés a
// docs/chunking-strategia.md-ben), tehát a "milyen gyakran öntözzem a kígyónövényt?"
// kérdés az 54 egyforma öntözési szakasszal találkozik, és egyik sem árulja el, melyik
// növényről szól. Ezért minden darab elé beírjuk, HONNAN jött:
//
//     How To Care for a Snake Plant › Water
//
// Az előtag a `content`-be megy, nem külön oszlopba: így nincs migráció, és a modell is
// látja, melyik szakaszból idéz — ez a groundingnak is jót tesz.
//
// TÖRZS NÉLKÜLI DARABOK: a korpuszban 75 üres címsor-bekezdés van, 37 fájlban (mérve:
// 6× "###", 25× "####", 42× "#####", 2× "######"). Előtag nélkül
// ezek jelentés nélküli, 3 karakteres szemétdarabok; ELŐTAGGAL viszont címszerű, jól
// embeddelődő darabok lennének ÜRES tartalommal. Az előtag tehát nem semlegesíti, hanem
// FELERŐSÍTENÉ őket — ezért esnek ki.
//
// PRÓZA-CÍMSOR NEM ÚTVONAL: a korpuszban a cikkek bevezetője gyakran címsorként van
// formázva (lásd HEADING_AS_PROSE lejjebb). Az ilyen sor TARTALOM, tehát a törzsben marad
// — de az ÚTVONALBA nem kerül be. Enélkül a teljes bevezető rárakódott előtagként a
// szakasz MINDEN darabjára, egyszer a törzsben, egyszer a fejlécben. Mérve a 202 fájlon:
// 381 darab (20%) előtagja volt 100 karakternél hosszabb, 121-é 200-nál, a leghosszabb
// 624 karakter — a szűréssel 191 a maximum, és 200 fölött már egy sincs. A darabszám nem
// változik tőle (1906), csak az előtag lesz az, aminek szántuk: rövid helymegjelölés.
//
// AMI NEM GARANCIA: a `maxChars` cél-méret, nem kemény korlát, és sosem volt az. Az
// átfedésként átvitt bekezdés a méret-ellenőrzés UTÁN kerül vissza a keretbe, az útvonal-
// előtag pedig az emit()-ben, szintén utólag. Mérve: a régi chunkerben 104 darab lógott
// 1000 karakter fölé (max 1932), az újban 215 (max 1988). A vektorizálás ezt elbírja
// (a text-embedding-3-small kerete 8191 token), a lehetőség viszont álljon itt kimondva.

export interface Chunk {
  /** A darab szövege — EZT embeddeljük, és ezt kapja majd a modell. */
  content: string;
  /** Hányadik darab a dokumentumban (0-tól) — a sorrend a hivatkozáshoz kell. */
  index: number;
}

export interface ChunkOptions {
  /** Cél-méret karakterben. ~1000 karakter ≈ 250 token ≈ egy jól fókuszált gondolat. */
  maxChars?: number;
  /** Átfedés: az előző darab utolsó bekezdése átjön ide is. */
  overlap?: boolean;
  /**
   * A dokumentum címe — a címsor-útvonal első eleme. MEGADÁSA NÉLKÜL nincs előtag,
   * és a kimenet karakterre azonos a korábbi viselkedéssel.
   */
  docTitle?: string;
}

const DEFAULT_MAX_CHARS = 1000;
const PATH_SEPARATOR = ' › ';

interface Heading {
  readonly level: number;
  readonly text: string;
}

/**
 * "## Water" → { level: 2, text: 'Water' }; "###" → { level: 3, text: '' }.
 *
 * A `#` után SZÓKÖZ (vagy sorvég) kell — ez a markdown szabálya is, és itt védelem:
 * a `#hashtag` alak különben h1-nek számítana, és a `path.length = 0` KINULLÁZNÁ a
 * címsor-útvonalat a dokumentum hátralévő részére. A mai korpuszban ilyen sor nincs
 * (mérve: 0 találat a `^#{1,6}[^ #\s]` mintára a 202 fájlon), tehát ez nem javítás,
 * hanem bebiztosítás — ugyanaz a `(\s|$)` feltétel, amit a `hasProse` már használ.
 */
function parseHeading(paragraph: string): Heading | null {
  // Csak az ELSŐ sort nézzük: egy bekezdés kezdődhet címsorral és folytatódhat szöveggel.
  const firstLine = paragraph.split('\n', 1)[0] ?? '';
  const match = firstLine.match(/^(#{1,6})(?:\s+(.*))?$/);
  if (!match) {
    return null;
  }
  return { level: (match[1] as string).length, text: (match[2] ?? '').trim() };
}

/**
 * Ennyi karakter fölött egy címsor már MONDAT, nem címke. Mérve a korpuszon: 49 darab
 * áll ilyen, "######"-tal jelölt bevezető szövegből — a leghosszabb valódi szakaszcím
 * ("Perfect Pairings For Your Plants") ennél jóval rövidebb, tehát a határ tisztán vág.
 *
 * KÉT helyen dönt, ugyanabban a szellemben: a `hasProse` emiatt TARTJA MEG az ilyen
 * darabot (tartalom, nem címke), a `chunkMarkdown` pedig emiatt NEM teszi be az
 * útvonalba (helymegjelölésnek egy bekezdésnyi szöveg használhatatlan).
 */
const HEADING_AS_PROSE = 60;

/**
 * Van-e a darabban BÁRMI a címsorokon kívül? Ha nincs, a darab csak címke — üres
 * tartalommal versenyezne a keresésben, ezért nem kerül a tudásbázisba.
 *
 * A kivétel MÉRÉSBŐL jött: a korpuszban a cikkek bevezetője gyakran címsorként van
 * formázva ("###### Ferns are fabulous. They are amongst the first plants…"). Az
 * tartalom, nem címke; ha a puszta "#-sor = nem törzs" szabályt alkalmaznánk rá,
 * 49 tartalmas darabot dobnánk el. A hossz a legolcsóbb megkülönböztető köztük.
 */
function hasProse(content: string): boolean {
  return content.split('\n').some((line) => {
    const trimmed = line.trim();
    if (trimmed.length === 0) {
      return false;
    }
    if (!/^#{1,6}(\s|$)/.test(trimmed)) {
      return true;
    }
    return trimmed.replace(/^#{1,6}\s*/, '').length > HEADING_AS_PROSE;
  });
}

/** Egy túl hosszú bekezdést mondathatáron vágunk — ez a vészfék, nem az alapeset. */
function splitLongParagraph(paragraph: string, maxChars: number): string[] {
  const sentences = paragraph.split(/(?<=[.!?])\s+/);
  const parts: string[] = [];
  let current = '';
  for (const sentence of sentences) {
    if (current && current.length + sentence.length > maxChars) {
      parts.push(current.trim());
      current = '';
    }
    current += sentence + ' ';
  }
  if (current.trim()) {
    parts.push(current.trim());
  }
  return parts;
}

/** A darab elé írt útvonal. docTitle nélkül nincs előtag — a régi viselkedés. */
function withBreadcrumb(
  body: string,
  path: readonly string[],
  docTitle: string | undefined,
): string {
  if (docTitle === undefined) {
    return body;
  }
  // A h1 rendszerint MAGA a dokumentum címe — ne írjuk ki kétszer.
  const trail = [docTitle, ...path.filter((entry) => entry !== docTitle)];
  return `${trail.join(PATH_SEPARATOR)}\n\n${body}`;
}

/**
 * Markdown dokumentum → darabok. Alcím-határon új darabot nyit, bekezdés-határon vág,
 * cél-méretig pakol, egy bekezdésnyit átfed, és minden darab elé beírja a címsor-útvonalat.
 *
 * A `maxChars` CÉL-méret, nem kemény korlát: az átfedett bekezdés és az útvonal-előtag
 * is a méret-ellenőrzés után kerül a darabba. A fejléc mérésekkel írja le, mennyivel.
 *
 * A markdown front matter (--- … ---) kiszedése és a bolti zaj szűrése NEM itt van:
 * az a betöltő dolga (apps/cli/src/lib/knowledge-document.ts) — ez a függvény tiszta
 * szövegtranszformáció, ezért tesztelhető DB és API nélkül.
 */
export function chunkMarkdown(
  text: string,
  options: ChunkOptions = {},
): Chunk[] {
  const maxChars = options.maxChars ?? DEFAULT_MAX_CHARS;
  const overlap = options.overlap ?? true;
  // Üres (vagy csak whitespace) cím = nincs cím. A betöltő ma nem ad ilyet, de a publikus
  // API engedi, és előtagként " › Water" alakú, fejnélküli útvonalat gyártana.
  const docTitle = options.docTitle?.trim() || undefined;

  // A markdown bekezdései: üres sor választja el őket. Ez a "szerző által adott" tagolás.
  const paragraphs = text
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph.length > 0)
    .flatMap((paragraph) =>
      paragraph.length > maxChars
        ? splitLongParagraph(paragraph, maxChars)
        : [paragraph],
    );

  const chunks: Chunk[] = [];
  let current: string[] = [];
  let currentLength = 0;

  // A címsor-útvonal szintenként: path[0] = h1, path[1] = h2, …
  const path: (string | undefined)[] = [];
  // A MOSTANI darab KEZDETÉN érvényes útvonal — nem a végén érvényes, mert egy darab
  // több alcímet is átfoghat, és a darab arról szól, ahol ELKEZDŐDÖTT.
  let startPath: string[] = [];

  const snapshotPath = (): string[] =>
    path.filter((entry): entry is string => Boolean(entry));

  const emit = (): void => {
    if (current.length === 0) {
      return;
    }
    const body = current.join('\n\n');
    // Csak címke, tartalom nélkül — nem megy a tudásbázisba. Az `index` a chunks
    // hosszából jön, tehát a kihagyástól sem lesz hézagos.
    if (!hasProse(body)) {
      return;
    }
    chunks.push({
      content: withBreadcrumb(body, startPath, docTitle),
      index: chunks.length,
    });
  };

  const flush = (): void => {
    // Átfedés: az utolsó bekezdés átjön a következő darabba is.
    const carried =
      overlap && current.length > 1 ? current[current.length - 1] : undefined;
    emit();
    current = carried ? [carried] : [];
    currentLength = carried ? carried.length : 0;
  };

  for (const paragraph of paragraphs) {
    const isHeading = paragraph.startsWith('#');

    // Alcímnél új darabot kezdünk (a szakasz elejét ne ragasszuk az előző szakasz
    // végéhez), és ilyenkor átfedést sem viszünk át — új gondolat kezdődik.
    // Az ELŐZŐ darab még a RÉGI útvonalat kapja, ezért zárunk a frissítés előtt.
    if (isHeading && current.length > 0) {
      emit();
      current = [];
      currentLength = 0;
    }

    if (isHeading) {
      const heading = parseHeading(paragraph);
      // A próza-címsor tartalom, nem címke: a törzsben marad, de az útvonalba nem
      // kerül be — különben a teljes bevezető előtagként rárakódna a szakasz minden
      // darabjára, ráadásul a törzs mellé, ugyanabba a darabba.
      if (heading && heading.text.length <= HEADING_AS_PROSE) {
        path.length = heading.level - 1; // a mélyebb szintek érvényüket vesztik
        path[heading.level - 1] = heading.text;
      }
    }

    if (currentLength + paragraph.length > maxChars) {
      flush();
    }

    // Új darab kezdődik: rögzítsük, hol állunk a dokumentum szerkezetében.
    if (current.length === 0) {
      startPath = snapshotPath();
    }

    current.push(paragraph);
    currentLength += paragraph.length;
  }

  flush();

  return chunks;
}
