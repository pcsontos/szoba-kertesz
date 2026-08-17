import { describe, expect, it, vi } from 'vitest';
import { fetchFeedCandidates } from './shopify-feed.js';

const page = (products: unknown[]) => ({
  ok: true,
  status: 200,
  json: async () => ({ products }),
});

describe('fetchFeedCandidates', () => {
  it('normalizál, HUF-ra vált, és kiszűri a nem-növényeket', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        page([
          {
            handle: 'monstera-deliciosa',
            title: 'Monstera deliciosa',
            product_type: 'plant',
            tags: ['botanical:Monstera deliciosa'],
            body_html: '<p>Nagy levelű</p>',
            variants: [
              { price: '19900', compare_at_price: null, available: true },
            ],
          },
          {
            handle: 'cserep',
            title: 'Kerámia cserép',
            product_type: 'planter',
            variants: [{ price: '2900', available: true }],
          },
        ]),
      )
      .mockResolvedValueOnce(page([]));

    const result = await fetchFeedCandidates(
      { source: 'tropicalhome.hu' },
      { fetch: fetchMock },
    );

    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0].latinName).toMatch(/Monstera/i);
    expect(result.candidates[0].priceHuf).toBe(19900);
  });

  it('a filter szűkíti a találatokat', async () => {
    const fetchMock = vi.fn().mockResolvedValue(page([]));
    const result = await fetchFeedCandidates(
      { source: 'tropicalhome.hu', filter: 'monstera' },
      { fetch: fetchMock },
    );
    expect(result.candidates).toEqual([]);
  });

  // A tropicalhome feedje magyar product_type-ot ad: a kurzus angol tiltólistája ezeket
  // átengedte, és a valódi feeden a jelöltek negyede kerámia kaspó volt (mérve 2026-08-16).
  // Ha ez a teszt elbukik, kaspó kerülhet a NÖVÉNY-katalógusba az ingest-agenten át.
  it('kiszűri a magyar típusnevű nem-növényeket is (Kaspók)', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      page([
        {
          handle: 'mylo-kaspo',
          title: '_Mylo kerámia kaspó kék 9cm',
          product_type: 'Kaspók',
          variants: [{ price: '4000', available: true }],
        },
        {
          handle: 'monstera-mint',
          title: 'Monstera deliciosa "Mint"',
          product_type: 'Monstera',
          variants: [{ price: '19000', available: true }],
        },
      ]),
    );

    const result = await fetchFeedCandidates(
      { source: 'tropicalhome.hu' },
      { fetch: fetchMock },
    );

    expect(result.candidates.map((c) => c.productType)).toEqual(['Monstera']);
  });
});
