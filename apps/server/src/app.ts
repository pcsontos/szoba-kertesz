import express, { type Express, type Request, type Response } from 'express';
import cors from 'cors';
import { z } from 'zod';
import {
  convertToModelMessages,
  type ModelMessage,
  type UIMessage,
} from 'ai';
import { askAgent, type AskResult, type UserRole } from '@szoba-kertesz/core';

// app.ts — VÉKONY HTTP-réteg a core agent fölött. A böngészőből érkező kérdés PONTOSAN
// ugyanazon az úton megy, mint a CLI-ben: askAgent → a közös agent-loop. A @szoba-kertesz/core
// framework-független; ez a szerver csak EGY belépési pont (a CLI a másik).
//
// DEBUG: az askAgent-et `print: true`-val hívjuk, ezért a SZERVER konzolján ugyanaz a színes,
// körről körre növekvő trace fut le, mint a CLI-ben. A böngésző csak a választ kapja.
//
// KLIENS: a web app a Vercel AI SDK useChat hookját használja (TextStreamChatTransport),
// NEM sima fetch-et. A useChat minden hívásnál a TELJES üzenet-előzményt (UIMessage[])
// elküldi — ebből vágjuk le az utolsó (új) user-üzenetet kérdésnek, a többit
// convertToModelMessages-szel alakítjuk az askAgent `history` opciójává, így a
// beszélgetés a szerveren is folytatódik körről körre.
//
// STREAMING: a válasz TOKENENKÉNT megy ki (streamText a core-ban, res.write() itt)
// sima szövegként (text/plain) — a TextStreamChatTransport ezt olvassa darabonként.
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

    // A tartalomtípust SZÁNDÉKOSAN csak az első tényleges kiírás előtt állítjuk
    // be. Korábban itt, a try előtt futott le — az Express `res.json()` viszont
    // csak akkor állít típust, ha még nincs, így a hibaág 500-as JSON törzse
    // `text/plain` fejléccel ment ki.
    let streamed = false;
    const writeChunk = (chunk: string): void => {
      if (!streamed) {
        res.type('text/plain');
        streamed = true;
      }
      res.write(chunk);
    };

    try {
      // A korábbi körök (a useChat mindig a teljes előzményt küldi) → history.
      // A validált üzenetek átadása az SDK-nak. A `unknown`-on át vezetett cast
      // itt SZÁNDÉKOS és a lehető legszűkebb: a UIMessage `parts` mezője
      // diszkriminált unió (minden résztípusnak saját kötelező mezői vannak),
      // amivel egy szándékosan laza séma sosem fog strukturálisan egyezni.
      //
      // Amit a séma GARANTÁL, mielőtt idáig eljutunk: `messages` nem üres, minden
      // elemnek van érvényes `role`-ja és `parts` TÖMBJE, a text-részeknek pedig
      // string `text`-je. Ez pontosan az, amire a kód támaszkodik.
      // Amit NEM garantál: hogy egy ismeretlen résztípust az SDK fel tud
      // dolgozni — ez a hívás ezért a try-blokkon BELÜL van, így egy ilyen
      // bemenet magyar 500-at ad, nem HTML stack trace-t.
      // Az `await` NEM elhagyható: a convertToModelMessages ebben az
      // SDK-verzióban Promise-t ad vissza (mérve — enélkül a `history` egy
      // Promise objektum lenne, és a spec `toHaveLength(2)` állítása bukik).
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
        onTextDelta: (delta: string) => {
          writeChunk(delta);
        },
      });

      // Ha a loop szöveg nélkül állt meg (pl. kimerült a lépéskeret), delta sem
      // keletkezett — ilyenkor a végső `answer` megy ki, ami az agent
      // `emptyAnswer`-e. Enélkül a böngésző ÜRES buborékot kapna 200-zal,
      // miközben a CLI ugyanebben a helyzetben látható választ ad.
      if (!streamed) {
        writeChunk(result.answer);
      }
      res.end();
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
