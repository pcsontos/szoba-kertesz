import express, { type Express, type Request, type Response } from 'express';
import cors from 'cors';
import { z } from 'zod';
import {
  convertToModelMessages,
  createUIMessageStream,
  pipeUIMessageStreamToResponse,
  streamText,
  toUIMessageStream,
  type ModelMessage,
  type UIMessage,
} from 'ai';
import {
  askAgent,
  defaultThreadStore,
  toThreadTitle,
  ThreadIdSchema,
  type AskResult,
  type StoredMessage,
  type ThreadStore,
  type UserRole,
} from '@szoba-kertesz/core';
import { createDebugKnowledgeRouter } from './debug-knowledge.js';
import { createThreadsRouter } from './threads.js';

// app.ts — VÉKONY HTTP-réteg a core agent fölött. A böngészőből érkező kérdés PONTOSAN
// ugyanazon az úton megy, mint a CLI-ben: askAgent → a közös agent-loop. A @szoba-kertesz/core
// framework-független; ez a szerver csak EGY belépési pont (a CLI a másik).
//
// DEBUG: az askAgent-et `print: true`-val hívjuk, ezért a SZERVER konzolján ugyanaz a színes,
// körről körre növekvő trace fut le, mint a CLI-ben. A böngésző csak a választ kapja.
//
// KLIENS: a web app a Vercel AI SDK useChat hookját használja (DefaultChatTransport),
// NEM sima fetch-et. A 07. alkalom óta a kliens CSAK AZ ÚJ ÜZENETET küldi
// (`prepareSendMessagesRequest`), az előzményt a szerver a threads/messages táblákból
// tölti. A DB az igazságforrás — és ez biztonsági javítás is: eddig a böngésző
// tetszőleges HAMIS előzményt küldhetett fel a nyitott cors() mögött.
//
// STREAMING: a válasz AI SDK ÜZENET-STREAMKÉNT megy ki (text/event-stream), nem sima
// szövegként. A 05. alkalomban még text/plain ment `res.write()`-tal — a váltás oka NEM
// a sebesség: egy karakterfolyamba nem fér bele egy TOOL-HÍVÁS. Az üzenet-stream típusos
// részeket visz (`text` ÉS `tool-runSql` ÉS `tool-searchKnowledge`, bemenettel és
// eredménnyel együtt), ebből rajzol kártyát a böngésző.
//
// HIBA: futás közben keletkező hiba `error` RÉSZKÉNT megy ki, magyar szöveggel
// (createUIMessageStream onError) — a kliens ezt a useChat `error`-jából jeleníti meg.
//
// Az `ask` injektálható: a specek valódi API-hívás nélkül futnak, a produkciós út mégis
// alapértelmezés. (Ugyanaz a minta, mint az interactive.ts-ben.)

export type AskFn = (
  question: string,
  options: {
    print: boolean;
    role?: UserRole;
    history?: readonly ModelMessage[];
    onTextDelta?: (delta: string) => void;
    // A típus a `streamText` visszatérési értékéből SZÁRMAZTATVA, nem kézzel
    // kiírva: a `StreamTextResult` típusparamétereinek száma SDK-verzióval
    // változik (ai@7.0.66-ban három van), a `ReturnType` viszont mindig az
    // marad, amit a core loopja ténylegesen átad. Ugyanez az idióma áll az
    // agent-loop.ts-ben is, a `result` változón.
    onStream?: (result: ReturnType<typeof streamText>) => void;
  },
) => Promise<AskResult>;

export interface CreateAppOptions {
  readonly ask?: AskFn;
  /** A beszélgetés-tár. Injektálható, hogy a route-ok DB nélkül tesztelhetők legyenek. */
  readonly store?: ThreadStore;
}

// A kérés HATÁRA — Zod-validálás, ahogy minden külvilágból jövő adatnál.
//
// A séma korábban csak annyit mondott, hogy `messages` egy nem-üres tömb
// (`z.array(z.unknown())`), utána `as UIMessage[]` cast következett. Egy `parts`
// nélküli üzenet így NEM a validálásban bukott el, hanem lejjebb, az
// extractText-ben, TypeError-ral — amiből az Express alapértelmezett
// hibakezelője 500-at csinált, HTML stack trace-szel a kliensnek. A séma ezért
// az üzenet ALAKJÁT is leírja, és a típus a sémából származik, nem castból.
//
// `looseObject`: a UIMessage-nek több mezője van, mint amennyi nekünk kell (és
// verzióról verzióra bővülhet) — az ismeretlen kulcsokat átengedjük, csak azt
// kötjük meg, amire ténylegesen támaszkodunk.
const MessagePartSchema = z.looseObject({
  type: z.string(),
  text: z.string().optional(),
});

const UiMessageSchema = z.looseObject({
  // A UIMessage három szerepet ismer — ismeretlen érték itt bukjon el, a
  // validálásban, ne lejjebb.
  role: z.enum(['system', 'user', 'assistant']),
  parts: z.array(MessagePartSchema),
});

// A SZERZŐDÉS MEGFORDULT: a kliens már csak az ÚJ üzenetet küldi, az előzményt a
// szerver a tárból tölti. Ez nemcsak kevesebb hálózati forgalom: eddig a böngésző
// tetszőleges HAMIS előzményt küldhetett fel a nyitott cors() mögött, és a szerver
// azt továbbadta a modellnek. Mostantól a szerver csak azt hiszi el, amit ő írt be.
const ChatRequestSchema = z.object({
  message: UiMessageSchema,
  threadId: ThreadIdSchema.optional(),
});

/** A validált üzenet alakja — a sémából LEVEZETVE, nem kézzel újraírva. */
type ValidatedMessage = z.infer<typeof UiMessageSchema>;

/** A szöveges részek összefűzése — a nem-szöveges részek kimaradnak. */
function extractText(message: ValidatedMessage): string {
  return message.parts
    .filter((part) => part.type === 'text')
    .map((part) => part.text ?? '')
    .join('');
}

/**
 * Van-e a válaszban bármi, amit érdemes eltárolni? Tartalom = nem üres SZÖVEG vagy
 * bármilyen TOOL-rész. A `step-start` önmagában nem az: az csak a lépéshatárt jelöli.
 *
 * A #8 PR-review 2. tétele nyomán: e nélkül egy megszakadt futás üres assistant-sort
 * hagyott a `messages` táblában.
 */
function hasContent(parts: readonly { type: string }[]): boolean {
  return parts.some((part) => {
    if (part.type.startsWith('tool-')) {
      return true;
    }
    const text = (part as { text?: unknown }).text;
    return (
      part.type === 'text' && typeof text === 'string' && text.trim() !== ''
    );
  });
}

export function createApp(options: CreateAppOptions = {}): Express {
  const ask: AskFn =
    options.ask ?? ((question, opts) => askAgent(question, opts));
  const store: ThreadStore = options.store ?? defaultThreadStore;

  const app = express();
  app.use(cors());
  app.use(express.json());

  // A RAG debug-felülete. ÉLESBEN NINCS MOUNTOLVA: a `?pipeline=full` kérésenként
  // egy HyDE- és egy rerank-hívást indít, tehát hitelesítés nélkül fizetős végpont
  // lenne a nyitott cors() mögött. Ugyanaz a gondolkodás, mint a szerep pinnelésénél.
  if (process.env.NODE_ENV !== 'production') {
    app.use('/debug/knowledge', createDebugKnowledgeRouter());
  }

  // A beszélgetés-lista és -betöltés. ÉLESBEN IS mountolva (nem úgy, mint a
  // /debug/knowledge): nem indít fizetős hívást, és a webes chat alapfunkciója.
  app.use('/api/threads', createThreadsRouter(store));

  app.post('/api/chat', async (req: Request, res: Response) => {
    const parsed = ChatRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error:
          'A kérés törzsében kötelező a "message" mező (egy `role` és `parts` mezőkkel ' +
          'rendelkező üzenet), a "threadId" pedig — ha megadod — UUID kell legyen.',
      });
      return;
    }

    const { message, threadId: requestedThreadId } = parsed.data;
    const question = message.role === 'user' ? extractText(message).trim() : '';
    if (question === '') {
      res.status(400).json({
        error: 'Az üzenetnek felhasználói kérdésnek kell lennie.',
      });
      return;
    }

    // A thread feloldása vagy létrehozása — MINDEN streamelés előtt, hogy a hiba
    // még rendes JSON státuszkód lehessen, ne `error` rész a stream közepén.
    let threadId: string;
    let stored: StoredMessage[];
    try {
      if (requestedThreadId) {
        const loaded = await store.loadThread(requestedThreadId);
        if (loaded === null) {
          res
            .status(404)
            .json({ error: `Nincs ilyen beszélgetés: ${requestedThreadId}.` });
          return;
        }
        threadId = requestedThreadId;
        stored = loaded;
      } else {
        threadId = await store.createThread(toThreadTitle(question));
        stored = [];
      }
      // A kérdés mentése az agent futása ELŐTT: egy megszakadt futás se veszítse el.
      await store.appendMessage(threadId, 'user', message.parts);
    } catch (error: unknown) {
      const detail = error instanceof Error ? error.message : String(error);
      res
        .status(500)
        .json({ error: `A beszélgetés mentése nem sikerült: ${detail}` });
      return;
    }

    // A tárolt üzenetek UIMessage-alakban. A cast SZŰK és SZÁNDÉKOS: a UIMessage.parts
    // diszkriminált unió, amivel egy `unknown[]` sosem egyezik strukturálisan.
    const historyUiMessages = [
      ...stored.map((entry) => ({
        id: String(entry.id),
        role: entry.role,
        parts: entry.parts,
      })),
      message,
    ] as unknown as UIMessage[];

    let sawText = false;
    let savePromise: Promise<void> = Promise.resolve();

    try {
      // ÜZENET-stream, nem szöveg-stream. A böngésző így nemcsak a válasz betűit kapja meg,
      // hanem a TOOL-HÍVÁSOKAT és a TOOL-EREDMÉNYEKET is, típusos részekként
      // (`tool-runSql`, `tool-searchKnowledge`) — ebből rajzol kártyát a kliens.
      //
      // Miért createUIMessageStream, és nem a rövidebb result.pipeUIMessageStreamToResponse?
      // Mert a #4-es review 2. tétele (üres futás is válaszol) csak így marad meg: a writerrel
      // a stream lezárása ELŐTT be tudjuk írni az agent emptyAnswer-ét.
      const stream = createUIMessageStream({
        // Az onEnd ehhez fűzi hozzá a választ. Enélkül a responseMessage üres lenne.
        originalMessages: historyUiMessages,
        execute: async ({ writer }) => {
          // A thread azonosítója MÉG AZ AGENT FUTÁSA ELŐTT kimegy, hogy egy elhasalt
          // futás után is tudja a kliens, melyik beszélgetésről volt szó.
          writer.write({ type: 'data-thread', data: { threadId } });

          // Az `await` NEM elhagyható: a convertToModelMessages ebben az
          // SDK-verzióban Promise-t ad vissza.
          const history = await convertToModelMessages(
            historyUiMessages.slice(0, -1),
          );

          const result = await ask(question, {
            print: true,
            // A SZEREP PINNELVE, nem örökölt. Enélkül a modul-szintű CURRENT_ROLE
            // dönt — miközben a user-role.ts fejkommentje épp azt ajánlja demóhoz,
            // hogy azt a konstanst írd át `admin`-ra. Nyitott cors() mellett a
            // hitelesítés nélküli végpont így admin-képessé válna.
            role: 'customer',
            history,
            // Csak JELZŐ: ment-e ki egyáltalán szöveg.
            onTextDelta: () => {
              sawText = true;
            },
            onStream: (streamResult) => {
              writer.merge(toUIMessageStream({ stream: streamResult.stream }));
            },
          });

          if (!sawText) {
            // A loop szöveg nélkül állt meg (pl. kimerült a lépéskeret): a végső answer
            // az agent emptyAnswer-e. Enélkül a böngésző ÜRES buborékot kapna 200-zal.
            const id = 'fallback';
            writer.write({ type: 'text-start', id });
            writer.write({ type: 'text-delta', id, delta: result.answer });
            writer.write({ type: 'text-end', id });
          }
        },
        // A mentési hook neve onEnd — az onFinish deprecated alias ebben az SDK-ban.
        onEnd: ({ responseMessage }) => {
          // A data-thread rész KONTROLL-jel, nem tartalom: kiszűrjük a tárból.
          const parts = responseMessage.parts.filter(
            (part) => part.type !== 'data-thread',
          );
          // TARTALOM NÉLKÜLI választ NEM mentünk. Egy az első delta ELŐTT elhasaló
          // futás (API-hiba, rate limit) üres `parts`-ot hagyna maga után — mérve —,
          // amiből a böngésző visszatöltéskor üres buborékot rajzolna, a CLI pedig
          // `content: ''`-t adna a modellnek. A kérdés ilyenkor MÁR el van mentve
          // (szándékosan, az agent futása előtt): a meghiúsult forduló egyszerűen
          // válasz nélkül marad, ami pontosan a történtek leírása.
          if (!hasContent(parts)) {
            return;
          }
          // A mentés hibája NEM viheti el a választ — a stream ilyenkor már kiment.
          // Ugyanaz az elv, mint a Trace és a JSONL függetlenségénél.
          savePromise = store
            .appendMessage(threadId, 'assistant', parts)
            .catch((error: unknown) => {
              console.error(
                `A válasz mentése nem sikerült (thread ${threadId}): ${
                  error instanceof Error ? error.message : String(error)
                }`,
              );
            });
        },
        // Az SDK alapértelmezése ELREJTI a hiba szövegét ("An error occurred."). Nekünk a
        // magyar, beszédes üzenet kell.
        onError: (error: unknown) =>
          `Az agent futása megszakadt: ${error instanceof Error ? error.message : String(error)}`,
      });

      await pipeUIMessageStreamToResponse({ response: res, stream });
      // A válasz már kiment; a mentést itt várjuk meg, hogy a tesztek és a
      // folyamat-leállás determinisztikus legyen. A kliens ebből nem vesz észre semmit.
      await savePromise;
    } catch (error: unknown) {
      // BUKTATÓ: ha már ment ki darab, a státusz és a fejlécek NEM módosíthatók
      // ("Cannot set headers after they are sent") — ilyenkor csak lezárni lehet.
      if (res.headersSent) {
        res.end();
        return;
      }
      const detail = error instanceof Error ? error.message : String(error);
      res.status(500).json({ error: `Az agent futása megszakadt: ${detail}` });
    }
  });

  return app;
}
