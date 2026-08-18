import { render } from '@testing-library/react';
import App from './App.js';

/**
 * A generátor „Welcome web" placeholder tesztjének helyére lépő smoke-teszt.
 * Nem a chat-logikát méri (az a szerver + agent dolga, és a Task 11 élő
 * ellenőrzése fedi), csak azt, hogy a felület felépül és a beviteli mező
 * kezdetben küldésre KÉSZ, de üresen tiltott — ez a "ne küldj üres kérdést"
 * szabály a felület oldalán.
 */

describe('App', () => {
  it('felépül, és a kezdő üzenet a katalógusról kérdezésre hív', () => {
    const { getByRole, getByPlaceholderText } = render(<App />);

    expect(getByRole('heading', { name: 'Szobakertész' })).toBeTruthy();
    expect(getByPlaceholderText('Írd ide a kérdésed…')).toBeTruthy();
  });

  it('üres bemenettel a Küldés tiltott', () => {
    const { getByRole } = render(<App />);

    const submit = getByRole('button', { name: 'Küldés' }) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
  });
});
