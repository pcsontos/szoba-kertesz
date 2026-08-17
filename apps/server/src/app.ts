import express, { type Express, type Request, type Response } from 'express';
import cors from 'cors';
import { z } from 'zod';
import { askAgent, type AskResult } from '@szoba-kertesz/core';

// app.ts — VÉKONY HTTP-réteg a core agent fölött. A böngészőből érkező kérdés PONTOSAN
// ugyanazon az úton megy, mint a CLI-ben: askAgent → a közös agent-loop. A @szoba-kertesz/core
// framework-független; ez a szerver csak EGY belépési pont (a CLI a másik).
//
// DEBUG: az askAgent-et `print: true`-val hívjuk, ezért a SZERVER konzolján ugyanaz a színes,
// körről körre növekvő trace fut le, mint a CLI-ben. A böngésző csak a választ kapja.
//
// STREAMING: NINCS — ez a /api/chat egyszerre válaszol a teljes szöveggel. A tokenenkénti
// változat a Task 8-ban jön.
//
// Az `ask` injektálható: a specek valódi API-hívás nélkül futnak, a produkciós út mégis
// alapértelmezés. (Ugyanaz a minta, mint az interactive.ts-ben.)

export type AskFn = (
  question: string,
  options: { print: boolean },
) => Promise<AskResult>;

export interface CreateAppOptions {
  readonly ask?: AskFn;
}

/** A kérés HATÁRA — Zod-validálás, ahogy minden külvilágból jövő adatnál. */
const ChatRequestSchema = z.object({
  message: z.string().trim().min(1),
});

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
        error: 'A kérés törzsében kötelező egy nem üres "message" mező.',
      });
      return;
    }

    try {
      const result = await ask(parsed.data.message, { print: true });
      res.json({ answer: result.answer });
    } catch (error: unknown) {
      const detail = error instanceof Error ? error.message : String(error);
      res.status(500).json({ error: `Az agent futása megszakadt: ${detail}` });
    }
  });

  return app;
}
