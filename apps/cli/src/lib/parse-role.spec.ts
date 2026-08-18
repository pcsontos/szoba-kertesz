import { describe, expect, it } from 'vitest';
import { parseRole } from './parse-role.js';

describe('parseRole', () => {
  it('elfogadja a két érvényes szerepet', () => {
    expect(parseRole('customer')).toBe('customer');
    expect(parseRole('admin')).toBe('admin');
  });

  it('tűri a nagybetűt és a szóközt', () => {
    expect(parseRole('  ADMIN ')).toBe('admin');
  });

  it('ismeretlen értékre magyar hibaüzenettel dob, ami felsorolja az érvényeseket', () => {
    expect(() => parseRole('root')).toThrow(/customer, admin/);
    expect(() => parseRole(undefined)).toThrow(/szerep/i);
  });
});
