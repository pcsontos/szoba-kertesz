import { describe, expect, it } from 'vitest';
import { guardSql } from '@szoba-kertesz/core';
import { buildPlantSearchSql, PlantSearchSchema } from './plant-search-sql.js';

// A determinisztikus kereső tesztje. Az agent-as-tool (ask_szobakertesz) így NEM
// tesztelhető — az modellt hív. Ez a különbség a két MCP-tool-stílus ára és haszna.

describe('buildPlantSearchSql', () => {
  it('szűrő nélkül is érvényes, LIMIT-es SELECT-et ad', () => {
    const { sql, params } = buildPlantSearchSql({});

    expect(sql).toMatch(/^SELECT .* FROM products ORDER BY .* LIMIT 10$/);
    expect(params).toEqual([]);
  });

  it('az értékeket paraméterként adja át, nem az SQL szövegében', () => {
    const { sql, params } = buildPlantSearchSql({
      keres: 'monstera',
      maxAr: 5000,
    });

    expect(sql).toContain('$1');
    expect(sql).toContain('$2');
    expect(sql).not.toContain('monstera');
    expect(params).toEqual(['%monstera%', 5000]);
  });

  it('az injekciós kísérlet is csak egy paraméter-érték marad', () => {
    const { sql, params } = buildPlantSearchSql({
      keres: "'; DROP TABLE products; --",
    });

    expect(sql).not.toContain('DROP');
    expect(params[0]).toBe("%'; DROP TABLE products; --%");
  });

  it('a boolean szűrők fix feltételek, nem paraméterek', () => {
    const { sql, params } = buildPlantSearchSql({
      petSafe: true,
      csakRaktaron: true,
      legtisztito: true,
    });

    expect(sql).toContain('pet_safe = TRUE');
    expect(sql).toContain('stock > 0');
    expect(sql).toContain('air_purifying = TRUE');
    expect(params).toEqual([]);
  });

  it('a rendezés kulcsból képződik, a hívó nem ad oszlopnevet', () => {
    expect(buildPlantSearchSql({ rendezes: 'ár' }).sql).toContain(
      'ORDER BY COALESCE(sale_price, price) ASC',
    );
    expect(buildPlantSearchSql({ rendezes: 'név' }).sql).toContain(
      'ORDER BY name ASC',
    );
  });

  it('a "hely" szűrő BEFOGADÓ: kültéri/beltéri a "mindkettő"-t is behozza, a "mindkettő" nem', () => {
    const kulteri = buildPlantSearchSql({ hely: 'kültéri' });
    expect(kulteri.sql).toContain('location IN ($1, $2)');
    expect(kulteri.params).toEqual(['kültéri', 'mindkettő']);

    const beltéri = buildPlantSearchSql({ hely: 'beltéri' });
    expect(beltéri.params).toEqual(['beltéri', 'mindkettő']);

    const mindketto = buildPlantSearchSql({ hely: 'mindkettő' });
    expect(mindketto.sql).toContain('location IN ($1)');
    expect(mindketto.params).toEqual(['mindkettő']);
  });

  it('a méret-szűrők a KIFEJLETT magasságra és a jelenlegi cserépméretre mennek', () => {
    const { sql, params } = buildPlantSearchSql({
      maxMagassagCm: 100,
      maxCserepCm: 20,
    });

    expect(sql).toContain('max_height_cm <= $1');
    expect(sql).toContain('current_pot_cm <= $2');
    expect(params).toEqual([100, 20]);
  });

  it('az ÖSSZES szűrő EGYSZERRE bekapcsolva is átmegy a core guardSql-jén', () => {
    // A guard tiltólistás (nem parser), tehát ELVBEN fals pozitívot adhatna a saját
    // generált SQL-ünkre (6. döntés) — ezt itt mérjük, nem feltételezzük.
    const { sql } = buildPlantSearchSql({
      keres: 'pálma',
      kategoria: 'szobanövény',
      hely: 'beltéri',
      feny: 'közepes',
      ontozes: 'közepes',
      nehezseg: 'kezdő',
      minAr: 1000,
      maxAr: 20000,
      petSafe: true,
      kidSafe: true,
      legtisztito: true,
      csakRaktaron: true,
      maxMagassagCm: 200,
      maxCserepCm: 30,
      rendezes: '-ár',
      limit: 5,
    });

    expect(guardSql(sql).allowed).toBe(true);
  });
});

describe('PlantSearchSchema', () => {
  it('elutasítja az ismeretlen enum-értéket', () => {
    expect(PlantSearchSchema.safeParse({ kategoria: 'bonszaj' }).success).toBe(
      false,
    );
  });

  it('elutasítja a limit fölötti kérést', () => {
    expect(PlantSearchSchema.safeParse({ limit: 500 }).success).toBe(false);
  });

  it('átengedi az érvényes, teljes szűrő-kombinációt', () => {
    const parsed = PlantSearchSchema.safeParse({
      kategoria: 'szobanövény',
      hely: 'kültéri',
      feny: 'alacsony',
      ontozes: 'ritka',
      nehezseg: 'kezdő',
      maxAr: 12000,
      petSafe: true,
      legtisztito: true,
      maxMagassagCm: 150,
      rendezes: '-ár',
    });

    expect(parsed.success).toBe(true);
  });
});
