import { render } from '@testing-library/react';
import { ToolCard } from './tool-card.js';

/**
 * EZ AZ, AMIT A SZÖVEG-STREAM NEM TUDOTT: amíg a szerver sima text/plain-t küldött,
 * a böngésző csak a válasz betűit látta. Az üzenet-stream tool-részeket is hoz —
 * ezekből rajzolunk kártyát.
 */

const knowledgeOutput = JSON.stringify({
  results: [
    {
      title: 'Monstera care',
      source: 'https://www.thesill.com/blogs/plants-101/monstera',
      content: 'Monstera care basics.',
      distance: 0.234,
    },
  ],
});

describe('ToolCard', () => {
  it('a tudásbázis-találatot címmel, forrás-linkkel és távolsággal mutatja', () => {
    const { getByText, getByRole } = render(
      <ToolCard
        toolName="searchKnowledge"
        state="output-available"
        input={{ question: 'miért sárgul?' }}
        output={knowledgeOutput}
      />,
    );

    expect(getByText('tudásbázis keresés')).toBeTruthy();
    expect(getByText('0.234')).toBeTruthy();
    const link = getByRole('link', {
      name: /Monstera care/,
    }) as HTMLAnchorElement;
    expect(link.href).toContain('thesill.com');
  });

  it('futás közben jelzi, hogy dolgozik — még nincs kimenet', () => {
    const { getByText } = render(
      <ToolCard
        toolName="searchKnowledge"
        state="input-available"
        input={{ question: 'miért sárgul?' }}
        output={undefined}
      />,
    );

    expect(getByText('fut…')).toBeTruthy();
  });

  /**
   * A runSql `content`-je a SOROK TÖMBJE (JSON.stringify(result.rows)), nem
   * `{ rowCount }` objektum — ez a teszt SZÁNDÉKOSAN a valódi tool-kimenetet
   * adja be. Az élő ellenőrzésen (Task 17, Step 8) a kártyán „sor" állt szám
   * nélkül, mert a komponens objektumot várt, a spec pedig egy olyan alakot
   * kapott, amit a valódi tool sosem küld.
   */
  it('a runSql kártya a LEFUTTATOTT lekérdezést és a sorszámot mutatja', () => {
    const rows = JSON.stringify([
      { name: 'Kaktusz', ar: 3200 },
      { name: 'Aloe', ar: 4100 },
      { name: 'Zamiokulkász', ar: 4900 },
    ]);
    const { getByText } = render(
      <ToolCard
        toolName="runSql"
        state="output-available"
        input={{ query: 'SELECT name FROM products LIMIT 5' }}
        output={rows}
      />,
    );

    expect(getByText('katalógus lekérdezés')).toBeTruthy();
    expect(getByText('SELECT name FROM products LIMIT 5')).toBeTruthy();
    expect(getByText(/^3 sor$/)).toBeTruthy();
  });

  /**
   * Hibaágon a runSql NEM JSON-t ad vissza, hanem magyar hibaszöveget
   * ("SQL elutasítva: …"). Ilyenkor sorszám-sor nem jelenhet meg.
   */
  it('nem-JSON kimenetre (hibaszöveg) nem ír sorszámot', () => {
    const { queryByText, getByText } = render(
      <ToolCard
        toolName="runSql"
        state="output-available"
        input={{ query: 'DELETE FROM products' }}
        output={'SQL elutasítva: csak SELECT futtatható.'}
      />,
    );

    expect(getByText('DELETE FROM products')).toBeTruthy();
    expect(queryByText(/sor$/)).toBeNull();
    // A hibaszöveg LÁTSZIK — a kártya mellett, nem helyette.
    expect(getByText('SQL elutasítva: csak SELECT futtatható.')).toBeTruthy();
  });

  /**
   * A #10 PR-review 2. tétele: a tool-hiba eddig SEHOL nem látszott gépből. A battery csak a
   * `data-tool`-t olvasta (a tool FUTOTT), azt nem, hogy SIKERÜLT-e — ezért egy „Tudásbázis-hiba"
   * a modell magyar parafrázisán át HAMIS ZÖLDET adott a RAG-grounding fokon.
   */
  it('hibás kimenetnél data-tool-error attribútumot tesz ki', () => {
    const { getByTestId } = render(
      <ToolCard
        toolName="searchKnowledge"
        state="output-available"
        input={{ question: 'Hogyan gondozzam?' }}
        output={'Tudásbázis-hiba: Incorrect API key provided.'}
      />,
    );

    const card = getByTestId('tool-card');
    expect(card.dataset['toolError']).toBe('true');
    expect(card.textContent).toContain('Tudásbázis-hiba');
  });

  it('SIKERES kimenetnél NINCS data-tool-error', () => {
    const { getByTestId } = render(
      <ToolCard
        toolName="searchKnowledge"
        state="output-available"
        input={{ question: 'Hogyan gondozzam?' }}
        output={'{"results":[]}'}
      />,
    );

    expect(getByTestId('tool-card').dataset['toolError']).toBeUndefined();
  });

  it('FUTÁS közben nincs hibajelzés (még nincs kimenet)', () => {
    const { getByTestId } = render(
      <ToolCard toolName="searchKnowledge" state="input-available" input={{}} output={undefined} />,
    );

    expect(getByTestId('tool-card').dataset['toolError']).toBeUndefined();
  });
});
