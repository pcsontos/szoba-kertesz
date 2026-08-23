// thread-list.tsx — a korábbi beszélgetések sávja.
//
// A lista a szerver /api/threads végpontjáról jön (Task 9), és NEM a böngésző
// tárolójából: az igazságforrás az adatbázis. Ezért látszik itt az a beszélgetés
// is, amit a CLI-ben indítottunk — ugyanabba a tárba írt.

export interface ThreadSummary {
  readonly id: string;
  readonly title: string;
  readonly updatedAt: string;
}

export interface ThreadListProps {
  readonly threads: readonly ThreadSummary[];
  readonly activeId?: string;
  readonly onOpen: (id: string) => void;
  readonly onNew: () => void;
}

/** A korábbi beszélgetések. A lista a szerver /api/threads végpontjáról jön. */
export function ThreadList({
  threads,
  activeId,
  onOpen,
  onNew,
}: ThreadListProps) {
  return (
    <aside className="hidden w-56 shrink-0 flex-col gap-2 border-r border-neutral-200 pr-4 sm:flex">
      <button
        type="button"
        onClick={onNew}
        className="rounded-lg bg-emerald-700 px-3 py-2 text-sm text-white"
      >
        Új beszélgetés
      </button>
      <nav
        aria-label="Korábbi beszélgetések"
        className="flex-1 space-y-1 overflow-y-auto"
      >
        {threads.length === 0 && (
          <p className="text-xs text-neutral-500">
            Még nincs mentett beszélgetés.
          </p>
        )}
        {threads.map((thread) => (
          <button
            key={thread.id}
            type="button"
            onClick={() => onOpen(thread.id)}
            aria-current={thread.id === activeId ? 'true' : undefined}
            className={
              thread.id === activeId
                ? 'block w-full truncate rounded px-2 py-1 text-left text-xs font-medium text-emerald-900'
                : 'block w-full truncate rounded px-2 py-1 text-left text-xs text-neutral-600'
            }
          >
            {thread.title}
          </button>
        ))}
      </nav>
    </aside>
  );
}
