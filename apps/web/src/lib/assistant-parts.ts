// assistant-parts.ts — az asszisztens-üzenet részeinek szétválogatása.
//
// Három dolog érkezik egy csatornán, és háromféle sorsuk van:
//   tool-*        → kártya (mit CSINÁLT az agent)
//   text          → markdown-szöveg (mit MOND)
//   data-thread   → VEZÉRLÉS: a beszélgetés azonosítója. Nem jelenik meg sehol,
//                   az URL-t írja át, hogy a beszélgetés megosztható legyen.
//
// Az `unknown`-ról indulunk, mert a részek alakja az SDK-tól jön, és verzióról
// verzióra bővülhet — csak arra a mezőre támaszkodunk, amit tényleg használunk.

export interface AssistantPart {
  readonly type: string;
  readonly text?: string;
  readonly data?: unknown;
  // A tool-részek mezői. Azért ITT vannak, és nem az App.tsx cast-jaiban, mert
  // a `part as { state: string }` alakú kényszerítés nem is fordul: az SDK
  // részei nem fedik ezt a típust, tehát a cast csak `unknown`-on át menne.
  readonly state?: string;
  readonly input?: unknown;
  readonly output?: unknown;
}

export interface AssistantSplit {
  readonly toolParts: readonly AssistantPart[];
  readonly text: string;
  readonly threadId: string | undefined;
}

function threadIdOf(part: AssistantPart): string | undefined {
  const data = part.data;
  if (typeof data === 'object' && data !== null) {
    const value = (data as { threadId?: unknown }).threadId;
    if (typeof value === 'string') {
      return value;
    }
  }
  return undefined;
}

export function splitAssistantParts(
  parts: readonly AssistantPart[],
): AssistantSplit {
  const toolParts = parts.filter((part) => part.type.startsWith('tool-'));
  const text = parts
    .filter((part) => part.type === 'text')
    .map((part) => part.text ?? '')
    .join('');
  const threadPart = parts.find((part) => part.type === 'data-thread');

  return {
    toolParts,
    text,
    threadId: threadPart ? threadIdOf(threadPart) : undefined,
  };
}
