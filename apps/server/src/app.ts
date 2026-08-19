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
import { askAgent, type AskResult, type UserRole } from '@szoba-kertesz/core';
import { createDebugKnowledgeRouter } from './debug-knowledge.js';

// app.ts — VÉKONY HTTP-réteg a core agent fölött. A böngészőből érkező kérdés PONTOSAN
// ugyanazon az úton megy, mint a CLI-ben: askAgent → a közös agent-loop. A @szoba-kertesz/core
// framework-független; ez a szerver csak EGY belépési pont (a CLI a másik).
//
// DEBUG: az askAgent-et `print: true`-val hívjuk, ezért a SZERVER konzolján ugyanaz a színes,
// körről körre növekvő trace fut le, mint a CLI-ben. A böngésző csak a választ kapja.
//
// KLIENS: a web app a Vercel AI SDK useChat hookját használja (DefaultChatTransport),
// NEM sima fetch-et. A useChat minden hívásnál a TELJES üzenet-előzményt (UIMessage[])
// elküldi — ebből vágjuk le az utolsó (új) user-üzenetet kérdésnek, a többit
// convertToModelMessages-szel alakítjuk az askAgent `history` opciójává, így a
// beszélgetés a szerveren is folytatódik körről körre.
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

const ChatRequestSchema = z.object({
  messages: z.array(UiMessageSchema).min(1),
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

export function createApp(options: CreateAppOptions = {}): Express {
  const ask: AskFn =
    options.ask ?? ((question, opts) => askAgent(question, opts));

  const app = express();
  app.use(cors());
  app.use(express.json());

  // A RAG debug-felülete. ÉLESBEN NINCS MOUNTOLVA: a `?pipeline=full` kérésenként
  // egy HyDE- és egy rerank-hívást indít, tehát hitelesítés nélkül fizetős végpont
  // lenne a nyitott cors() mögött. Ugyanaz a gondolkodás, mint a szerep pinnelésénél.
  if (process.env.NODE_ENV !== 'production') {
    app.use('/debug/knowledge', createDebugKnowledgeRouter());
  }

  app.post('/api/chat', async (req: Request, res: Response) => {
    const parsed = ChatRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error:
          'A kérés törzsében kötelező a "messages" tömb, benne `role` és `parts` mezővel rendelkező üzenetekkel.',
      });
      return;
    }

    const uiMessages = parsed.data.messages;
    const lastMessage = uiMessages[uiMessages.length - 1];
    const question =
      lastMessage?.role === 'user' ? extractText(lastMessage).trim() : '';
    if (question === '') {
      res.status(400).json({
        error: 'Az utolsó üzenetnek felhasználói kérdésnek kell lennie.',
      });
      return;
    }

    try {
      // ÜZENET-stream, nem szöveg-stream. A böngésző így nemcsak a válasz betűit kapja meg,
      // hanem a TOOL-HÍVÁSOKAT és a TOOL-EREDMÉNYEKET is, típusos részekként
      // (`tool-runSql`, `tool-searchKnowledge`) — ebből rajzol kártyát a kliens.
      //
      // Miért createUIMessageStream, és nem a rövidebb result.pipeUIMessageStreamToResponse?
      // Mert a #4-es review 2. tétele (üres futás is válaszol) csak így marad meg: a writerrel
      // a stream lezárása ELŐTT be tudjuk írni az agent emptyAnswer-ét. A rövidebb úton a
      // válasz már lezárult volna, mire kiderül, hogy egy delta sem ment ki. (Az a metódus
      // ráadásul deprecated is: az SDK maga a standalone helpereket ajánlja a result.stream-mel.)
      let sawText = false;

      const stream = createUIMessageStream({
        execute: async ({ writer }) => {
          // A korábbi körök (a useChat mindig a teljes előzményt küldi) → history.
          // A validált üzenetek átadása az SDK-nak. A `unknown`-on át vezetett cast
          // itt SZÁNDÉKOS és a lehető legszűkebb: a UIMessage `parts` mezője
          // diszkriminált unió, amivel egy szándékosan laza séma sosem fog
          // strukturálisan egyezni.
          // Az `await` NEM elhagyható: a convertToModelMessages ebben az
          // SDK-verzióban Promise-t ad vissza.
          const history = await convertToModelMessages(
            uiMessages.slice(0, -1) as unknown as UIMessage[],
          );

          const result = await ask(question, {
            print: true,
            // A SZEREP PINNELVE, nem örökölt. Enélkül a modul-szintű CURRENT_ROLE
            // dönt — miközben a user-role.ts fejkommentje épp azt ajánlja demóhoz,
            // hogy azt a konstanst írd át `admin`-ra. Nyitott cors() mellett a
            // hitelesítés nélküli végpont így admin-képessé válna (delegateToIngest
            // → írás a szoba-kertesz_rw szerepen). A szerver SOSEM vesz szerepet a
            // kérésből, és nem is örököl: itt mondjuk ki.
            role: 'customer',
            history,
            // Csak JELZŐ: ment-e ki egyáltalán szöveg. A tokeneket az üzenet-stream viszi.
            onTextDelta: () => {
              sawText = true;
            },
            onStream: (streamResult) => {
              writer.merge(toUIMessageStream({ stream: streamResult.stream }));
            },
          });

          if (!sawText) {
            // A loop szöveg nélkül állt meg (pl. kimerült a lépéskeret): a végső answer
            // az agent emptyAnswer-e. Enélkül a böngésző ÜRES buborékot kapna 200-zal,
            // miközben a CLI ugyanebben a helyzetben látható választ ad.
            const id = 'fallback';
            writer.write({ type: 'text-start', id });
            writer.write({ type: 'text-delta', id, delta: result.answer });
            writer.write({ type: 'text-end', id });
          }
        },
        // Az SDK alapértelmezése ELREJTI a hiba szövegét ("An error occurred."). Nekünk a
        // magyar, beszédes üzenet kell — ugyanaz, ami eddig az 500-as JSON törzsében ment.
        onError: (error: unknown) =>
          `Az agent futása megszakadt: ${error instanceof Error ? error.message : String(error)}`,
      });

      await pipeUIMessageStreamToResponse({ response: res, stream });
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
