import { echo } from './echo.js';

describe('echo', () => {
  it('prefixes the input with "echo: "', () => {
    expect(echo('szia')).toEqual('echo: szia');
  });

  it('handles the empty string', () => {
    expect(echo('')).toEqual('echo: ');
  });

  it('preserves Hungarian accented characters', () => {
    expect(echo('árvíztűrő tükörfúrógép')).toEqual(
      'echo: árvíztűrő tükörfúrógép',
    );
  });
});
