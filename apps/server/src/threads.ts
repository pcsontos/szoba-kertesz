import { Router, type Request, type Response } from 'express';
import {
  ThreadIdSchema,
  THREAD_LIST_LIMIT,
  type ThreadStore,
} from '@szoba-kertesz/core';

// threads.ts — a beszélgetés-lista és -betöltés HTTP-felülete. Csak OLVAS: írni
// kizárólag a /api/chat útján lehet, ott is csak a szerver maga.
//
// VÁLLALT KORLÁT: ezek hitelesítés nélküli végpontok a nyitott cors() mögött, tehát a
// lista MINDENKI beszélgetését visszaadja. Az UUID a TALÁLGATÁS ellen véd, a LISTÁZÁS
// ellen nem. A webes thread-lista enélkül nem működik, és a felület amúgy is
// hitelesítés nélküli (a fizetős agent-végpont is az). Ha valaha élesbe menne: egy
// localStorage-ból küldött kliens-azonosító, amire a lista szűr — nem hitelesítés,
// de a lista már "az enyém" lenne.
//
// A /debug/knowledge-dzsel ELLENTÉTBEN ez a router élesben IS mountolva van: nem indít
// fizetős hívást, és a webes chat alapfunkciója.

export function createThreadsRouter(store: ThreadStore): Router {
  const router = Router();

  router.get('/', async (_req: Request, res: Response) => {
    try {
      const threads = await store.listThreads(THREAD_LIST_LIMIT);
      res.json({ threads });
    } catch (error: unknown) {
      const detail = error instanceof Error ? error.message : String(error);
      res
        .status(500)
        .json({ error: `A beszélgetések listázása nem sikerült: ${detail}` });
    }
  });

  router.get('/:id', async (req: Request, res: Response) => {
    // A HATÁR: az URL-paraméter a külvilágból jön. Enélkül a Postgres
    // "invalid input syntax for type uuid" hibája szállna fel, és az Express
    // alapértelmezett hibakezelője 500-at adna, HTML stack trace-szel.
    const parsed = ThreadIdSchema.safeParse(req.params.id);
    if (!parsed.success) {
      res.status(400).json({
        error: `Érvénytelen beszélgetés-azonosító: ${req.params.id}. UUID-t várunk.`,
      });
      return;
    }

    try {
      const messages = await store.loadThread(parsed.data);
      // A tár NULL-t ad nem létező threadre és ÜRES TÖMBÖT üresre — pontosan ez a
      // különbség lesz itt a 404 és a 200 különbsége.
      if (messages === null) {
        res
          .status(404)
          .json({ error: `Nincs ilyen beszélgetés: ${parsed.data}.` });
        return;
      }
      res.json({ id: parsed.data, messages });
    } catch (error: unknown) {
      const detail = error instanceof Error ? error.message : String(error);
      res
        .status(500)
        .json({ error: `A beszélgetés betöltése nem sikerült: ${detail}` });
    }
  });

  return router;
}
