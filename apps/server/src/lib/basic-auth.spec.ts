import { describe, expect, it, vi } from 'vitest';
import type { Request, Response } from 'express';
import { createBasicAuth } from './basic-auth.js';

/**
 * A kapu, ami élesben az EGÉSZ appot fedi — a webes felületet is. Ezért a viselkedését
 * külön mérjük, nem csak route-szinten: egy elrontott fejléc-parse NÉMÁN átengedne.
 */

function fakeRes() {
  const headers: Record<string, string> = {};
  return {
    statusCode: 0,
    body: '',
    headers,
    setHeader(name: string, value: string) {
      headers[name] = value;
    },
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    send(body: string) {
      this.body = body;
      return this;
    },
  };
}

function run(authorization: string | undefined) {
  const middleware = createBasicAuth({ user: 'demo', password: 'titkos-jelszo' });
  const req = { headers: authorization ? { authorization } : {} } as unknown as Request;
  const res = fakeRes();
  const next = vi.fn();
  middleware(req, res as unknown as Response, next);
  return { res, next };
}

function basic(user: string, password: string): string {
  return `Basic ${Buffer.from(`${user}:${password}`, 'utf8').toString('base64')}`;
}

describe('createBasicAuth', () => {
  it('a helyes jelszót átengedi', () => {
    const { res, next } = run(basic('demo', 'titkos-jelszo'));
    expect(next).toHaveBeenCalledOnce();
    expect(res.statusCode).toBe(0);
  });

  it('fejléc nélkül 401-et ad, ÉS kiírja a WWW-Authenticate-et', () => {
    // A WWW-Authenticate nélkül a böngésző nem dobna fel jelszó-ablakot, csak egy
    // üres 401-es oldalt — a kapu működne, de használhatatlan lenne.
    const { res, next } = run(undefined);
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
    expect(res.headers['WWW-Authenticate']).toContain('Basic');
  });

  it('rossz jelszóra 401', () => {
    const { res, next } = run(basic('demo', 'rossz'));
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
  });

  it('rossz felhasználónévre 401', () => {
    const { res, next } = run(basic('masvalaki', 'titkos-jelszo'));
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
  });

  it('más sémára (Bearer) 401', () => {
    const { res, next } = run('Bearer titkos-jelszo');
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
  });

  it('kettőspont nélküli, hibás base64-tartalomra 401 — nem dobás', () => {
    // Ha ez DOBNA, a hibás fejléc 500-at adna, és a stack trace kiszivárogna.
    const encoded = Buffer.from('nincs-ketttospont', 'utf8').toString('base64');
    const { res, next } = run(`Basic ${encoded}`);
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
  });

  it('a jelszó ELEJE nem elég — a részleges egyezés is 401', () => {
    const { res } = run(basic('demo', 'titkos'));
    expect(res.statusCode).toBe(401);
  });
});
