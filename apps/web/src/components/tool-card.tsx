// tool-card.tsx — A TOOL-HÍVÁS MEGJELENÍTÉSE a chatben.
//
// EZ AZ, AMIT A SZÖVEG-STREAM NEM TUDOTT. Amíg a szerver sima text/plain-t küldött, a böngésző
// csak a végső válasz betűit látta — a tool-hívásokról nem tudott semmit. Az AI SDK üzenet-streamje
// típusos részeket küld, ezért a `message.parts`-ban most ott vannak a tool-részek is:
//
//   { type: 'tool-searchKnowledge', state: 'input-available',  input: {...} }   ← épp fut
//   { type: 'tool-searchKnowledge', state: 'output-available', output: '...' }  ← megvan az eredmény
//
// A tool `output`-ja NÁLUNK szöveg (a ToolOutcome.content, ami JSON): a toolok szándékosan
// szöveget adnak vissza a modellnek (lásd packages/core/.../tool-outcome.ts). Ezért parse-olunk.

interface KnowledgeResult {
  title: string;
  source: string;
  content: string;
  distance: number;
}

/** A tool JSON-szövegét biztonságosan alakítjuk objektummá — hibás/hiányzó kimenetre null. */
function parseOutput<T>(output: unknown): T | null {
  if (typeof output !== 'string') {
    return null;
  }
  try {
    return JSON.parse(output) as T;
  } catch {
    return null; // pl. hibaszöveg ("SQL elutasítva: …") — nem JSON
  }
}

/** A távolság színe: minél kisebb, annál jobb a találat. Ugyanaz a skála, mint a szerver-logban. */
function distanceColor(distance: number): string {
  if (distance < 0.3) {
    return 'text-emerald-700';
  }
  if (distance < 0.45) {
    return 'text-amber-600';
  }
  return 'text-rose-600';
}

const LABELS: Record<string, string> = {
  searchKnowledge: 'tudásbázis keresés',
  runSql: 'katalógus lekérdezés',
  listCategories: 'kategóriák',
  getClientPreferences: 'ügyfél-preferenciák',
  delegateToIngest: 'átadás a katalóguskezelőnek',
};

export interface ToolCardProps {
  toolName: string;
  state: string;
  input: unknown;
  output: unknown;
}

export function ToolCard({ toolName, state, input, output }: ToolCardProps) {
  const running = state !== 'output-available';

  return (
    <div className="my-2 rounded-lg border border-neutral-200 px-3 py-2 text-xs">
      <div className="flex items-center gap-2 font-medium text-neutral-600">
        {running && (
          <span
            aria-hidden="true"
            className="size-3 animate-spin rounded-full border-2 border-neutral-300 border-t-emerald-700"
          />
        )}
        <span>{LABELS[toolName] ?? toolName}</span>
        {running && <span className="text-neutral-400">fut…</span>}
      </div>

      {toolName === 'searchKnowledge' && (
        <KnowledgeCard input={input} output={output} running={running} />
      )}
      {toolName === 'runSql' && <SqlCard input={input} output={output} />}
    </div>
  );
}

function KnowledgeCard({
  input,
  output,
  running,
}: {
  input: unknown;
  output: unknown;
  running: boolean;
}) {
  const question = (input as { question?: string } | null)?.question;
  const parsed = parseOutput<{ results: KnowledgeResult[] }>(output);

  return (
    <div className="mt-2 space-y-1.5">
      {question && <p className="italic text-neutral-500">„{question}"</p>}
      {running && !parsed && (
        <p className="text-neutral-400">
          embedding → vektorkeresés → átrangsorolás…
        </p>
      )}
      {parsed?.results.map((result, index) => (
        <a
          key={`${result.source}-${index}`}
          href={result.source}
          target="_blank"
          rel="noreferrer"
          className="flex items-baseline gap-2 rounded px-1.5 py-1 no-underline hover:bg-neutral-100"
        >
          {/* A vektortávolság — ugyanaz a szám, ami a szerver-logban is fut. */}
          <span className={`font-mono ${distanceColor(result.distance)}`}>
            {result.distance.toFixed(3)}
          </span>
          <span className="flex-1 truncate font-medium">{result.title}</span>
        </a>
      ))}
      {parsed?.results.length === 0 && (
        <p className="text-neutral-500">nincs találat a tudásbázisban</p>
      )}
    </div>
  );
}

function SqlCard({ input, output }: { input: unknown; output: unknown }) {
  const query = (input as { query?: string } | null)?.query;
  const parsed = parseOutput<{ rowCount: number }>(output);

  return (
    <div className="mt-2 space-y-1">
      {query && (
        <pre className="overflow-x-auto rounded bg-neutral-100 p-2 font-mono text-[11px] leading-relaxed">
          {query}
        </pre>
      )}
      {parsed && <p className="text-neutral-500">{parsed.rowCount} sor</p>}
    </div>
  );
}
