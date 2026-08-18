import { describe, expect, it } from 'vitest';
import { CURRENT_ROLE, isAdmin, USER_ROLES } from './user-role.js';

describe('user-role', () => {
  it('pontosan két szerepet ismer: customer és admin', () => {
    expect(USER_ROLES).toEqual(['customer', 'admin']);
  });

  it('alapból vásárló — a bővebb jogosultság sosem az alapértelmezés', () => {
    expect(CURRENT_ROLE).toBe('customer');
    expect(isAdmin()).toBe(false);
  });

  it('az isAdmin csak az admin szerepre igaz', () => {
    expect(isAdmin('admin')).toBe(true);
    expect(isAdmin('customer')).toBe(false);
  });
});
