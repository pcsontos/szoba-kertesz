import { USER_ROLES, type UserRole } from '@szoba-kertesz/core';

/**
 * A `--role` kapcsoló értékének validálása a rendszer HATÁRÁN (a CLI a külvilág).
 * A commander mindent stringként ad tovább, ezért a bemenet `unknown`-ként jön be,
 * és csak ellenőrzés után válik `UserRole`-lá.
 */
export function parseRole(value: unknown): UserRole {
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    const match = USER_ROLES.find((role) => role === normalized);
    if (match) {
      return match;
    }
  }
  throw new Error(
    `Ismeretlen szerep: "${String(value)}". Érvényes szerepek: ${USER_ROLES.join(', ')}.`,
  );
}
