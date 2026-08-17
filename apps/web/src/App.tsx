import { useState, type FormEvent } from 'react';
import { Button } from './components/ui/button.js';
import { Input } from './components/ui/input.js';

// App.tsx — minimál chat. EBBEN A LÉPÉSBEN sima fetch: a válasz EGYBEN érkezik meg,
// addig a felület vár. A Task 8 írja át streamelőre (useChat) — a különbség
// ("várakozás + blokk" vs "szavanként épül") ekkor lesz demózható.

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

interface ChatMessage {
  readonly role: 'user' | 'assistant';
  readonly text: string;
}

export function App() {
  const [messages, setMessages] = useState<readonly ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: FormEvent): Promise<void> {
    event.preventDefault();
    const question = input.trim();
    if (question === '' || pending) {
      return;
    }

    setMessages((prev) => [...prev, { role: 'user', text: question }]);
    setInput('');
    setPending(true);

    try {
      const response = await fetch(`${API_URL}/api/chat`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ message: question }),
      });
      const data: unknown = await response.json();
      const answer =
        typeof data === 'object' && data !== null && 'answer' in data
          ? String((data as { answer: unknown }).answer)
          : 'A szerver nem küldött választ.';
      setMessages((prev) => [...prev, { role: 'assistant', text: answer }]);
    } catch (error: unknown) {
      const detail = error instanceof Error ? error.message : String(error);
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', text: `Hiba a szerver hívásakor: ${detail}` },
      ]);
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="mx-auto flex h-screen max-w-2xl flex-col gap-4 p-6">
      <h1 className="text-xl font-semibold text-emerald-900">Szobakertész</h1>

      <div className="flex-1 space-y-3 overflow-y-auto rounded-lg border border-neutral-200 p-4">
        {messages.length === 0 && (
          <p className="text-sm text-neutral-500">
            Kérdezz a növénykatalógusról — például: „Hány pozsgás van 5000 Ft
            alatt?"
          </p>
        )}
        {messages.map((message, index) => (
          <div
            key={index}
            className={
              message.role === 'user'
                ? 'ml-auto max-w-[80%] rounded-lg bg-emerald-700 px-3 py-2 text-sm text-white'
                : 'mr-auto max-w-[80%] whitespace-pre-wrap rounded-lg bg-neutral-100 px-3 py-2 text-sm'
            }
          >
            {message.text}
          </div>
        ))}
        {pending && <p className="text-sm text-neutral-400">Gondolkodom…</p>}
      </div>

      <form onSubmit={handleSubmit} className="flex gap-2">
        <Input
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder="Írd ide a kérdésed…"
          disabled={pending}
        />
        <Button type="submit" disabled={pending || input.trim() === ''}>
          Küldés
        </Button>
      </form>
    </main>
  );
}

export default App;
