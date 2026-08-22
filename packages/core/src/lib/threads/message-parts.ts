// message-parts.ts — a tár EGY, a nézet KETTŐ.
//
// A `messages.parts` a teljes UIMessage.parts JSON. A web ezt darabra pontosan
// visszakapja (a tool-kártyák is visszarajzolódnak), a CLI viszont terminál: ott a
// tool-kártyából csak a szöveg marad. Ez a két függvény a fordító a két nézet között.
//
// Következmény, ami demózható: egy CLI-ben indított beszélgetés megnyitható a
// böngészőben, és egy webes beszélgetés folytatható a CLI-ben.

export interface TextPart {
  readonly type: 'text';
  readonly text: string;
}

/** Terminál-oldali írás: egyetlen szöveg-part. */
export function textToParts(text: string): readonly TextPart[] {
  return [{ type: 'text', text }];
}

function isTextPart(part: unknown): part is TextPart {
  return (
    typeof part === 'object' &&
    part !== null &&
    (part as { type?: unknown }).type === 'text' &&
    typeof (part as { text?: unknown }).text === 'string'
  );
}

/**
 * Terminál-oldali olvasás: a szöveg-részek összefűzve, minden más eldobva.
 * A bemenet `unknown[]`, mert a tárból jön — nem megbízható alak.
 */
export function partsToText(parts: readonly unknown[]): string {
  return parts
    .filter(isTextPart)
    .map((part) => part.text)
    .join('');
}
