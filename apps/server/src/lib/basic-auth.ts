import { timingSafeEqual } from 'node:crypto';
import type { RequestHandler, Response } from 'express';

// basic-auth.ts — A KAPU. Élesben ez fedi az EGÉSZ appot: az /api-t ÉS a webes felületet is,
// tehát az URL még csak nem is böngészhető jelszó nélkül.
//
// MIÉRT KÉZZEL, és miért nem csomagból? Mert ez ~40 sor, a `node:crypto` mindent ad hozzá, és
// egy függőség kevesebb. A rate limitnél FORDÍTVA döntöttünk (lásd Task 2): ott a proxy mögötti
// kliens-IP és a szabványos fejlécek kezelése az, ami hibaérzékeny.
//
// MIÉRT `timingSafeEqual`? Mert a `===` korán kilép az első eltérő bájtnál, és a válaszidőből
// karakterenként ki lehetne találni a jelszót. Ez a kapu az egyetlen védelem — nem engedhetjük
// meg, hogy kimérhető legyen.

export interface BasicAuthCredentials {
  readonly user: string;
  readonly password: string;
}

/**
 * Konstans idejű összehasonlítás. Eltérő hossznál a `timingSafeEqual` DOBNA, ezért előbb
 * hosszt nézünk — ez a puszta hosszt kiszivárogtatja, ami egy jelszónál vállalható, a
 * dobásból származó 500-as viszont nem lenne az.
 */
function safeEqual(actual: string, expected: string): boolean {
  const a = Buffer.from(actual, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  if (a.length !== b.length) {
    return false;
  }
  return timingSafeEqual(a, b);
}

function challenge(res: Response): void {
  // A WWW-Authenticate nélkül a böngésző nem dob fel jelszó-ablakot.
  res.setHeader('WWW-Authenticate', 'Basic realm="Szobakertesz", charset="UTF-8"');
  res.status(401).send('Hitelesítés szükséges.');
}

export function createBasicAuth(
  expected: BasicAuthCredentials,
): RequestHandler {
  return (req, res, next) => {
    const header = req.headers.authorization ?? '';
    const separator = header.indexOf(' ');
    const scheme = separator === -1 ? '' : header.slice(0, separator);
    const encoded = separator === -1 ? '' : header.slice(separator + 1);

    if (scheme.toLowerCase() !== 'basic' || encoded === '') {
      challenge(res);
      return;
    }

    const decoded = Buffer.from(encoded, 'base64').toString('utf8');
    const colon = decoded.indexOf(':');
    if (colon === -1) {
      challenge(res);
      return;
    }

    // MINDKETTŐT kiértékeljük, mielőtt döntünk: a rövidzár a felhasználónévnél
    // elárulná, hogy a név helyes volt-e.
    const userOk = safeEqual(decoded.slice(0, colon), expected.user);
    const passwordOk = safeEqual(decoded.slice(colon + 1), expected.password);
    if (!userOk || !passwordOk) {
      challenge(res);
      return;
    }

    next();
  };
}
