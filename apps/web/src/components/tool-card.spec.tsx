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

  it('a runSql kártya a LEFUTTATOTT lekérdezést mutatja', () => {
    const { getByText } = render(
      <ToolCard
        toolName="runSql"
        state="output-available"
        input={{ query: 'SELECT name FROM products LIMIT 5' }}
        output={'{"rowCount":5}'}
      />,
    );

    expect(getByText('katalógus lekérdezés')).toBeTruthy();
    expect(getByText('SELECT name FROM products LIMIT 5')).toBeTruthy();
  });
});
