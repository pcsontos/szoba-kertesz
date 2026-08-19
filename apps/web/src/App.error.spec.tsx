import { render } from '@testing-library/react';
import { vi } from 'vitest';

/**
 * A HIBA-ÁG külön fájlban, mert itt a useChat MOCKOLVA van — az App.spec.tsx
 * smoke-tesztjei szándékosan a valódi hookkal futnak.
 *
 * Miért kell ez a teszt: a szerver a futásidejű hibát `error` RÉSZKÉNT küldi
 * magyar szöveggel (app.ts `onError`), a useChat pedig az `error` mezőbe teszi,
 * NEM üzenetbe. Amíg az App nem vette ki, a felhasználó semmit nem látott —
 * a régi text/plain protokoll alatt a hibaszöveg még sima üzenetként megjelent.
 * Ez a #6 PR review 1. tétele.
 */

const chatState: {
  error: Error | undefined;
} = { error: undefined };

vi.mock('@ai-sdk/react', () => ({
  useChat: () => ({
    messages: [],
    sendMessage: vi.fn(),
    status: 'ready',
    stop: vi.fn(),
    error: chatState.error,
  }),
}));

const { default: App } = await import('./App.js');

describe('App — hibakezelés', () => {
  it('hiba nélkül nincs jelzősáv', () => {
    chatState.error = undefined;
    const { queryByRole } = render(<App />);

    expect(queryByRole('alert')).toBeNull();
  });

  it('a szerver MAGYAR hibaüzenete megjelenik a felületen', () => {
    chatState.error = new Error(
      'Az agent futása megszakadt: API hiba a második körben',
    );
    const { getByRole } = render(<App />);

    const alert = getByRole('alert');
    expect(alert.textContent).toContain('Az agent futása megszakadt');
    expect(alert.textContent).toContain('API hiba a második körben');
  });

  it('a hibaüzenet nem szivárogtat stack trace-t', () => {
    chatState.error = new Error('Az agent futása megszakadt: rate limit');
    const { getByRole } = render(<App />);

    expect(getByRole('alert').textContent).not.toContain('at ');
  });
});
