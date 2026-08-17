import express, { type Express, type Request, type Response } from 'express';
import cors from 'cors';
import { z } from 'zod';
import {
  convertToModelMessages,
  type ModelMessage,
  type UIMessage,
} from 'ai';
import { askAgent, type AskResult } from '@szoba-kertesz/core';

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
    history?: readonly ModelMessage[];
    onTextDelta?: (delta: string) => void;
  },
) => Promise<AskResult>;

export interface CreateAppOptions {
  readonly ask?: AskFn;
}

/** A kérés HATÁRA — Zod-validálás, ahogy minden külvilágból jövő adatnál. */
const ChatRequestSchema = z.object({
  messages: z.array(z.unknown()).min(1),
});

/** A UIMessage szöveges részeinek összefűzése — a nem-szöveges részek kimaradnak. */
function extractText(message: UIMessage): string {
  return message.parts
    .filter(
      (part): part is { type: 'text'; text: string } => part.type === 'text',
    )
    .map((part) => part.text)
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
      res
        .status(400)
        .json({ error: 'A kérés törzsében kötelező a "messages" tömb.' });
      return;
    }

    const uiMessages = parsed.data.messages as UIMessage[];
    const lastMessage = uiMessages[uiMessages.length - 1];
    const question =
      lastMessage?.role === 'user' ? extractText(lastMessage).trim() : '';
    if (question === '') {
      res.status(400).json({
        error: 'Az utolsó üzenetnek felhasználói kérdésnek kell lennie.',
      });
      return;
    }

    res.type('text/plain');

    try {
      // A korábbi körök (a useChat mindig a teljes előzményt küldi) → history.
      const history = await convertToModelMessages(uiMessages.slice(0, -1));

      await ask(question, {
        print: true,
        history,
        onTextDelta: (delta: string) => {
          res.write(delta);
        },
      });
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
