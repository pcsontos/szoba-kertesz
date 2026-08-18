import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useChat } from '@ai-sdk/react';
import { TextStreamChatTransport } from 'ai';
import Markdown from 'react-markdown';
import { Button } from './components/ui/button.js';
import { Input } from './components/ui/input.js';
import { isNearBottom } from './lib/scroll.js';

// App.tsx — a chat MOST MÁR streamel. A useChat a TextStreamChatTransport-tal
// nyers szöveg-folyamot olvas (text/plain), és minden darabbal újrarendereli az
// utolsó üzenetet: a válasz szavanként épül fel, nem egyben ugrik be.
// A hook minden küldésnél a TELJES előzményt átküldi — a szerver ebből csinál
// history-t, így a visszautaló kérdés ("és olcsóbbat?") is működik.
//
// Három UX quick win, mert streamelés közben mindhárom hiánya azonnal feltűnik:
//   markdown       — az agent felsorolást ír; nyersen a "- " karakterek látszanának
//   okos scroll    — stream közben csak akkor görgetünk, ha a felhasználó alul van
//   Állj gomb      — egy hosszú válasz megszakítható

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

const textOf = (message: {
  parts: readonly { type: string; text?: string }[];
}): string =>
  message.parts
    .filter((part) => part.type === 'text')
    .map((part) => part.text ?? '')
    .join('');

export function App() {
  const [input, setInput] = useState('');
  const { messages, sendMessage, status, stop } = useChat({
    transport: new TextStreamChatTransport({ api: `${API_URL}/api/chat` }),
  });

  const streaming = status === 'streaming' || status === 'submitted';

  const viewRef = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);

  // A felhasználó szándékát a GÖRGETÉSKOR jegyezzük meg, nem rendereléskor:
  // ha stream közben feljebb olvas, nem rángatjuk vissza.
  function handleScroll(): void {
    const view = viewRef.current;
    if (view) {
      stickToBottom.current = isNearBottom(view);
    }
  }

  useEffect(() => {
    const view = viewRef.current;
    if (view && stickToBottom.current) {
      view.scrollTop = view.scrollHeight;
    }
  }, [messages]);

  function handleSubmit(event: FormEvent): void {
    event.preventDefault();
    const question = input.trim();
    if (question === '' || streaming) {
      return;
    }
    setInput('');
    void sendMessage({ text: question });
  }

  return (
    <main className="mx-auto flex h-screen max-w-2xl flex-col gap-4 p-6">
      <h1 className="text-xl font-semibold text-emerald-900">Szobakertész</h1>

      <div
        ref={viewRef}
        onScroll={handleScroll}
        className="flex-1 space-y-3 overflow-y-auto rounded-lg border border-neutral-200 p-4"
      >
        {messages.length === 0 && (
          <p className="text-sm text-neutral-500">
            Kérdezz a növénykatalógusról — például: „Hány pozsgás van 5000 Ft
            alatt?"
          </p>
        )}
        {messages.map((message) => (
          <div
            key={message.id}
            className={
              message.role === 'user'
                ? 'ml-auto max-w-[80%] rounded-lg bg-emerald-700 px-3 py-2 text-sm text-white'
                : 'mr-auto max-w-[80%] whitespace-pre-wrap rounded-lg bg-neutral-100 px-3 py-2 text-sm'
            }
          >
            {message.role === 'assistant' ? (
              <div className="prose-sm space-y-2 [&_li]:ml-4 [&_li]:list-disc">
                <Markdown>{textOf(message)}</Markdown>
              </div>
            ) : (
              textOf(message)
            )}
          </div>
        ))}
      </div>

      <form onSubmit={handleSubmit} className="flex gap-2">
        <Input
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder="Írd ide a kérdésed…"
        />
        {streaming ? (
          <Button type="button" variant="outline" onClick={() => stop()}>
            Állj
          </Button>
        ) : (
          <Button type="submit" disabled={input.trim() === ''}>
            Küldés
          </Button>
        )}
      </form>
    </main>
  );
}

export default App;
