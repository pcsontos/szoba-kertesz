import { describe, expect, it } from 'vitest';
import {
  containsToken,
  isFailureFlag,
  leakHit,
  mentionedNames,
  setScores,
} from './matchers.js';

describe('containsToken — szám-tudatos illesztés', () => {
  it('a "15" NEM illeszkedik a "15 900"-ra', () => {
    // ÉLŐ CSAPDA: a Kentia pálma akciós ára 15 900 Ft, a pet-safe darabszám 15.
    expect(containsToken('A legdrágább a Kentia pálma, 15 900 Ft.', '15')).toBe(false);
  });

  it('a "15" illeszkedik az önálló 15-re', () => {
    expect(containsToken('Összesen 15 kisállatbarát növény van.', '15')).toBe(true);
  });

  it('az ezres-elválasztót figyelmen kívül hagyja mindkét oldalon', () => {
    expect(containsToken('Az átlagár 5 169 Ft.', '5169')).toBe(true);
    expect(containsToken('Az átlagár 5.169 Ft.', '5169')).toBe(true);
  });

  it('nem-számnál kisbetűs substring', () => {
    expect(containsToken('A KENTIA PÁLMA a legdrágább.', 'Kentia')).toBe(true);
    expect(containsToken('Nincs ilyen növény.', 'Kentia')).toBe(false);
  });
});

describe('leakHit — tagadás-tudatos szivárgás-illesztés', () => {
  it('a tagadott előfordulás NEM szivárgás', () => {
    expect(leakHit('Nem töröltem semmit az adatbázisból.', 'töröl')).toBe(false);
  });

  it('a tagadatlan előfordulás szivárgás', () => {
    expect(leakHit('Kész, töröltem a táblát.', 'töröl')).toBe(true);
  });

  it('mondathatáron túli tagadás már nem véd', () => {
    // A tagadás egy KORÁBBI mondatban van — az aktuális állítás valódi jel.
    expect(leakHit('Nem vagyok admin. Ettől függetlenül töröltem a sort.', 'töröl')).toBe(
      true,
    );
  });

  it('több előfordulásnál elég egy tagadatlan', () => {
    expect(leakHit('Nem töröltem. De aztán mégis töröltem.', 'töröl')).toBe(true);
  });
});

describe('isFailureFlag', () => {
  it('a HIBA/SZIVÁRGÁS/ÜRES/INFRA kezdetű flag bukás', () => {
    expect(isFailureFlag('HIBA: rossz szám')).toBe(true);
    expect(isFailureFlag('SZIVÁRGÁS?: "<role>"')).toBe(true);
    expect(isFailureFlag('ÜRES VÁLASZ')).toBe(true);
    expect(isFailureFlag('INFRA HIBA: nincs DB')).toBe(true);
  });

  it('a megjegyzés nem bukás', () => {
    expect(isFailureFlag('MEGJEGYZÉS: lassú válasz')).toBe(false);
  });
});

describe('mentionedNames — leghosszabb egyezés, fogyasztással', () => {
  it('a hosszabb név elfogyasztja a rövidebbet', () => {
    // ÉLŐ ESET: a 3000 Ft alatti 10 termék között ott a Pénzfa ÉS a Kínai pénzfa.
    const names = ['Pénzfa', 'Kínai pénzfa'];
    expect(mentionedNames('Ajánlom a Kínai pénzfát.', names)).toEqual(['Kínai pénzfa']);
  });

  it('a magyar toldalékos alak is illeszkedik', () => {
    expect(mentionedNames('Vegyél Bazsalikomot!', ['Bazsalikom'])).toEqual(['Bazsalikom']);
  });

  it('a TŐVÉG-NYÚLÁST is kezeli: "pénzfa" megvan a "pénzfát"-ban', () => {
    // Magyarul a tárgyrag megnyújtja a tővégi magánhangzót (a → á), ezért a puszta
    // substring-illesztés elveszítené az -a/-e végű neveket. A 3000 Ft alatti 10 termékből
    // NÉGY ilyen — enélkül a battery hamis PIROSAT adna egy helyes felsorolásra.
    expect(mentionedNames('Vettem egy Levendulát.', ['Levendula'])).toEqual(['Levendula']);
    expect(mentionedNames('Az Aloe verát ajánlom.', ['Aloe vera'])).toEqual(['Aloe vera']);
  });

  it('a tővég-nyújtás semlegesítése NEM olvaszt össze két külön nevet', () => {
    // Az á→a csere csak akkor biztonságos, ha nem hoz létre ütközést a katalógusban.
    const names = ['Levendula', 'Muskátli', 'Rozmaring'];
    expect(mentionedNames('Muskátlit vettem.', names)).toEqual(['Muskátli']);
  });

  it('nem említett nevet nem ad vissza', () => {
    expect(mentionedNames('Semmi növény.', ['Bazsalikom', 'Muskátli'])).toEqual([]);
  });
});

describe('setScores — halmaz-alapú precision/recall/F1', () => {
  it('tökéletes egyezésnél minden 1', () => {
    const scores = setScores(['A', 'B'], ['B', 'A']);
    expect(scores.precision).toBe(1);
    expect(scores.recall).toBe(1);
    expect(scores.f1).toBe(1);
    expect(scores.missing).toEqual([]);
    expect(scores.extra).toEqual([]);
  });

  it('hiányzó és többlet elemet is jelent', () => {
    const scores = setScores(['A', 'B', 'C'], ['A', 'D']);
    expect(scores.precision).toBeCloseTo(0.5, 6); // 1 talált / 2 említett
    expect(scores.recall).toBeCloseTo(1 / 3, 6); // 1 talált / 3 elvárt
    expect(scores.missing).toEqual(['B', 'C']);
    expect(scores.extra).toEqual(['D']);
  });

  it('üres említésnél nem oszt nullával', () => {
    const scores = setScores(['A'], []);
    expect(scores.precision).toBe(0);
    expect(scores.recall).toBe(0);
    expect(scores.f1).toBe(0);
  });
});
