// check-role-passwords.ts — MEGFIGYELHETŐ bizonyíték arra, hogy a gyenge alapértelmezés
// NEM működik. Nem azt nézi, hogy "lefutott-e a bootstrap", és nem is fájlt olvas: TÉNYLEGESEN
// megpróbál csatlakozni a default jelszóval (ami a szerep neve), és azt várja, hogy MINDHÁROM
// kísérlet ELBUKIK.
//
// Ha bármelyik SIKERÜL, az éles adatbázis a publikus repóban olvasható jelszóval elérhető.
//
// "NEM TUDTUK LETESZTELNI" ≠ "A JELSZÓ EL LETT UTASÍTVA". A Postgres a hitelesítés valódi
// elutasítását a 28P01 (invalid_password) vagy 28000 (invalid_authorization_specification)
// SQLSTATE-kóddal jelzi — ez a script CSAK ezt a két kódot fogadja el bizonyítékként. Minden
// más hiba (rossz host, elérhetetlen hálózat, DNS-hiba, timeout, TLS-hiba, vagy akár a szerep
// hiánya) azt jelenti, hogy a próba EL SEM JUTOTT a jelszó-ellenőrzésig, tehát semmit nem
// bizonyít — egy elgépelt élesbeli DATABASE_URL emiatt korábban hamis "rendben"-t adott volna.
import { Pool } from 'pg';

const ROLES = ['szoba-kertesz_ro', 'szoba-kertesz_rw', 'szoba-kertesz_chat'] as const;

// A Postgres SQLSTATE-kódjai, amik VALÓDI hitelesítési elutasítást jelentenek.
const AUTH_REJECTION_CODES = new Set(['28P01', '28000']);

type ConnectResult =
  | { readonly outcome: 'rejected' } // a szerver elutasította a jelszót — ez a várt, biztonságos eset
  | { readonly outcome: 'connected' } // a gyenge jelszó működött — BUKÁS
  | { readonly outcome: 'inconclusive'; readonly error: unknown }; // nem jutottunk el a jelszó-ellenőrzésig

function isPgErrorWithCode(error: unknown): error is { code: string } {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof (error as { code: unknown }).code === 'string'
  );
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function attemptConnect(baseUrl: string, role: string): Promise<ConnectResult> {
  const url = new URL(baseUrl);
  url.username = encodeURIComponent(role);
  url.password = encodeURIComponent(role); // a gyenge alapértelmezés
  const pool = new Pool({ connectionString: url.toString(), connectionTimeoutMillis: 5000 });
  try {
    await pool.query('SELECT 1');
    return { outcome: 'connected' };
  } catch (error) {
    if (isPgErrorWithCode(error) && AUTH_REJECTION_CODES.has(error.code)) {
      return { outcome: 'rejected' };
    }
    // Nem hitelesítési hiba — pl. rossz host, DNS-hiba, timeout, TLS-hiba. Ez NEM bizonyítja,
    // hogy a jelszó el lett utasítva, ezért nem szabad "rendben"-ként kezelni.
    return { outcome: 'inconclusive', error };
  } finally {
    await pool.end().catch(() => undefined);
  }
}

async function main(): Promise<void> {
  try {
    process.loadEnvFile();
  } catch {
    // shellből is jöhet
  }

  const adminUrl = process.env['DATABASE_URL'];
  if (!adminUrl) {
    console.error('check-role-passwords: hiányzó DATABASE_URL.');
    process.exit(1);
  }

  const leaked: string[] = [];
  const inconclusive: string[] = [];

  for (const role of ROLES) {
    const result = await attemptConnect(adminUrl, role);
    if (result.outcome === 'connected') {
      leaked.push(role);
    } else if (result.outcome === 'inconclusive') {
      inconclusive.push(role);
      console.error(
        `check-role-passwords: NEM SIKERÜLT letesztelni a(z) ${role} szerepet — a kapcsolódás ` +
          'nem a jelszó miatt bukott el, tehát ez NEM tekinthető "elutasítva" eredménynek. ' +
          `Eredeti hiba: ${errorMessage(result.error)}`,
      );
    }
  }

  if (inconclusive.length > 0) {
    console.error(
      'check-role-passwords: BUKÁS — a fenti szerep(ek) tesztje nem jutott el a jelszó-' +
        'ellenőrzésig (pl. hibás DATABASE_URL, elérhetetlen adatbázis, hálózati vagy TLS-hiba). ' +
        'Ellenőrizd a kapcsolati adatokat, és futtasd újra — "nem tudtuk letesztelni" nem ' +
        'egyenlő azzal, hogy "a jelszó el lett utasítva".',
    );
    process.exit(1);
  }

  if (leaked.length > 0) {
    console.error(
      'check-role-passwords: BUKÁS — a következő szerepek a PUBLIKUS repóban olvasható ' +
        `alapértelmezett jelszóval elérhetők: ${leaked.join(', ')}. ` +
        'Futtasd a `pnpm db:roles`-t erős jelszavakkal.',
    );
    process.exit(1);
  }

  console.log(
    'check-role-passwords: rendben — mind a három szerep elutasítja az alapértelmezett jelszót.',
  );
}

void main();
