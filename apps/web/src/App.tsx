import { useState, type FormEvent } from 'react';
import { useChat } from '@ai-sdk/react';
import { TextStreamChatTransport } from 'ai';
import { Button } from './components/ui/button.js';
import { Input } from './components/ui/input.js';

// App.tsx — a chat MOST MÁR streamel. A useChat a TextStreamChatTransport-tal
// nyers szöveg-folyamot olvas (text/plain), és minden darabbal újrarendereli az
// utolsó üzenetet: a válasz szavanként épül fel, nem egyben ugrik be.
// A hook minden küldésnél a TELJES előzményt átküldi — a szerver ebből csinál
// history-t, így a visszautaló kérdés ("és olcsóbbat?") is működik.

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

export function App() {
  const [input, setInput] = useState('');
  const { messages, sendMessage, status } = useChat({
    transport: new TextStreamChatTransport({ api: `${API_URL}/api/chat` }),
  });

  const streaming = status === 'streaming' || status === 'submitted';

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

      <div className="flex-1 space-y-3 overflow-y-auto rounded-lg border border-neutral-200 p-4">
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
            {message.parts
              .filter((part) => part.type === 'text')
              .map((part, index) => (
                <span key={index}>{part.text}</span>
              ))}
          </div>
        ))}
      </div>

      <form onSubmit={handleSubmit} className="flex gap-2">
        <Input
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder="Írd ide a kérdésed…"
        />
        <Button type="submit" disabled={streaming || input.trim() === ''}>
          Küldés
        </Button>
      </form>
    </main>
  );
}

export default App;
