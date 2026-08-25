import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from 'react';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport, type UIMessage } from 'ai';
import Markdown from 'react-markdown';
import { ToolCard } from './components/tool-card.js';
import { ThreadList, type ThreadSummary } from './components/thread-list.js';
import { Button } from './components/ui/button.js';
import { Input } from './components/ui/input.js';
import {
  splitAssistantParts,
  type AssistantPart,
} from './lib/assistant-parts.js';
import { toStoredMessages, toThreadSummaries } from './lib/api-shapes.js';
import { isNearBottom } from './lib/scroll.js';

// App.tsx — a chat streamel, mutatja a tool-lépéseket, és MOST MÁR EMLÉKSZIK.
//
// KÉT PROTOKOLL — ezt érdemes megérteni:
//
//   TextStreamChatTransport (a 05. alkalomban): a szerver sima szöveget (text/plain) küld.
//     Streamel, de a `message.parts`-ban CSAK `text` rész van. A tool-hívásokról a böngésző
//     nem tud semmit — nem azért, mert lassú a stream, hanem mert egy karakterfolyamba nem
//     fér bele egy tool-hívás.
//
//   DefaultChatTransport (MOST): a szerver az AI SDK ÜZENET-streamjét küldi. Ugyanúgy streamel,
//     de TÍPUSOS részeket: `text` ÉS `tool-runSql` ÉS `tool-searchKnowledge` (input + output).
//     Ezért tudunk kártyát rajzolni a tool-eredményből — lásd components/tool-card.tsx.
//
// ÉS EGY SZERZŐDÉS-VÁLTÁS (07. alkalom): a hook eddig minden küldésnél a TELJES előzményt
// felküldte, a szerver pedig abból csinált historyt. Mostantól csak az ÚJ üzenet megy fel
// (`prepareSendMessagesRequest`), az előzményt a szerver az adatbázisból tölti a threadId
// alapján. Ez nem sávszélesség-kérdés: a böngészőből jövő előzmény HAMISÍTHATÓ volt.
//
// Három UX quick win, mert streamelés közben mindhárom hiánya azonnal feltűnik:
//   markdown       — az agent felsorolást ír; nyersen a "- " karakterek látszanának
//   okos scroll    — stream közben csak akkor görgetünk, ha a felhasználó alul van
//   Állj gomb      — egy hosszú válasz megszakítható
//   hiba-sáv       — a szerver magyar hibaüzenete LÁTSZIK (a useChat `error`-ja)

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

/** A user-buborék szövege: ott csak text-részek vannak. */
const textOf = (message: {
  parts: readonly { type: string; text?: string }[];
}): string =>
  message.parts
    .filter((part) => part.type === 'text')
    .map((part) => part.text ?? '')
    .join('');

export function App() {
  const [input, setInput] = useState('');

  // A threadId REF, nem state: a transport egyszer jön létre, és a closure-jének
  // mindig az AKTUÁLIS értéket kell látnia. Kezdőérték a megosztott URL-ből.
  const threadIdRef = useRef<string | undefined>(
    new URLSearchParams(window.location.search).get('thread') ?? undefined,
  );
  const [threads, setThreads] = useState<ThreadSummary[]>([]);
  const [activeId, setActiveId] = useState<string | undefined>(
    threadIdRef.current,
  );

  const { messages, setMessages, sendMessage, status, stop, error } = useChat({
    transport: new DefaultChatTransport({
      api: `${API_URL}/api/chat`,
      // A SZERZŐDÉS: csak az ÚJ üzenet megy fel, az előzményt a szerver a DB-ből tölti.
      prepareSendMessagesRequest: ({ messages: sent }) => ({
        body: {
          message: sent[sent.length - 1],
          threadId: threadIdRef.current,
        },
      }),
    }),
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

  // A lista frissítése induláskor és minden befejezett válasz után.
  useEffect(() => {
    if (status !== 'ready') {
      return;
    }
    void fetch(`${API_URL}/api/threads`)
      .then((response) => response.json())
      // A VÁLASZ ALAKJÁT is ellenőrizzük, nem csak a hálózati hibát: a szerver
      // hibaválasza is JSON, tehát a `.json()` sikerrel lefut, és a `threads` mező
      // hiányzik. Validálatlanul ez `setThreads(undefined)` lenne, és a ThreadList
      // `threads.length`-je az EGÉSZ felületet elvinné (lásd lib/api-shapes.ts).
      .then((body: unknown) => setThreads(toThreadSummaries(body)))
      .catch(() => setThreads([]));
  }, [status]);

  // Az ÚJ thread azonosítója a data-thread részből jön: beírjuk az URL-be, hogy a
  // beszélgetés megosztható és újratölthető legyen.
  useEffect(() => {
    const last = messages[messages.length - 1];
    if (!last || last.role !== 'assistant') {
      return;
    }
    const { threadId } = splitAssistantParts(last.parts as AssistantPart[]);
    if (threadId && threadId !== threadIdRef.current) {
      threadIdRef.current = threadId;
      setActiveId(threadId);
      window.history.replaceState(null, '', `?thread=${threadId}`);
    }
  }, [messages]);

  const openThread = useCallback(
    (id: string) => {
      threadIdRef.current = id;
      setActiveId(id);
      window.history.replaceState(null, '', `?thread=${id}`);
      void fetch(`${API_URL}/api/threads/${id}`)
        .then((response) => response.json())
        .then((body: unknown) => {
          // Ugyanaz a határ, mint a listánál. A cast SZŰK és validált adatra megy —
          // ugyanaz a minta, mint a szerver `as unknown as UIMessage[]`-je: a
          // `UIMessage.parts` diszkriminált unió, amit strukturálisan nem lehet
          // megfeleltetni a tárból jövő `unknown[]`-nek.
          setMessages(toStoredMessages(body) as unknown as UIMessage[]);
          stickToBottom.current = true;
        })
        .catch(() => undefined);
    },
    [setMessages],
  );

  // A ?thread=<id> URL-ből induló betöltés — EGYSZER, induláskor. A ref-guard azért
  // kell, mert az effekt az openThread identitására fut újra: enélkül egy újratöltés
  // felülírhatná a közben elkezdett beszélgetést.
  const restored = useRef(false);
  useEffect(() => {
    if (restored.current || threadIdRef.current === undefined) {
      return;
    }
    restored.current = true;
    openThread(threadIdRef.current);
  }, [openThread]);

  function startNewThread(): void {
    threadIdRef.current = undefined;
    setActiveId(undefined);
    window.history.replaceState(null, '', window.location.pathname);
    setMessages([]);
  }

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
    <main className="mx-auto flex h-screen max-w-4xl gap-4 p-6">
      <ThreadList
        threads={threads}
        activeId={activeId}
        onOpen={openThread}
        onNew={startNewThread}
      />

      <div className="flex min-w-0 flex-1 flex-col gap-4">
        <h1 className="text-xl font-semibold text-emerald-900">Szobakertész</h1>

        {/* A `data-testid`-ek a Playwright-battery fogódzói (tools/autotest, 08. alkalom).
            A buborékoknak nincs más stabil horgja — csak Tailwind-osztályok —, és egy törött
            selector NÉMÁN ZÖLDET adna: a battery üres szöveget olvasna, és nem találna
            redFlaget ott, ahol nem is olvas. Az `App.testids.spec.tsx` pinneli őket. */}
        <div
          ref={viewRef}
          onScroll={handleScroll}
          data-testid="message-list"
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
              data-testid="message"
              data-role={message.role}
              className={
                message.role === 'user'
                  ? 'ml-auto max-w-[80%] rounded-lg bg-emerald-700 px-3 py-2 text-sm text-white'
                  : 'mr-auto max-w-[80%] whitespace-pre-wrap rounded-lg bg-neutral-100 px-3 py-2 text-sm'
              }
            >
              {message.role === 'assistant'
                ? (() => {
                    // ELŐSZÖR a tool-lépések (mit csinált), UTÁNA a válasz (mit mond).
                    // A data-thread rész VEZÉRLÉS: se kártyára, se szövegbe nem kerül.
                    const { toolParts, text } = splitAssistantParts(
                      message.parts as AssistantPart[],
                    );
                    return (
                      <div className="space-y-1">
                        {toolParts.map((part, index) => (
                          <ToolCard
                            key={`${message.id}-tool-${index}`}
                            toolName={part.type.replace('tool-', '')}
                            state={part.state}
                            input={part.input}
                            output={part.output}
                          />
                        ))}
                        {text !== '' && (
                          <div
                            data-testid="assistant-text"
                            className="prose-sm space-y-2 [&_li]:ml-4 [&_li]:list-disc"
                          >
                            <Markdown>{text}</Markdown>
                          </div>
                        )}
                      </div>
                    );
                  })()
                : textOf(message)}
            </div>
          ))}
        </div>

        {/* A HIBA LÁTHATÓ. A szerver a futásidejű hibát `error` RÉSZKÉNT küldi, magyar
            szöveggel (app.ts onError) — a useChat ezt az `error`-ba teszi, nem üzenetbe.
            Amíg ezt senki nem rendereltük, a felhasználó SEMMIT nem látott: ha a hiba az
            első delta előtt jött, a status visszaállt `ready`-re, buborék nélkül. */}
        {error && (
          <p
            role="alert"
            className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800"
          >
            {error.message}
          </p>
        )}

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
      </div>
    </main>
  );
}

export default App;
