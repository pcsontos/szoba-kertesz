// A @szoba-kertesz/core publikus felülete. A szerkezet a tananyag térképe:
//   agents/ — KI mit csinál: minden agent saját könyvtárban (agent + promptja);
//             a KÖZÖS agent-loop eggyel kintebb (agents/agent-loop.ts)
//   tools/  — MIVEL: minden tool saját könyvtárban, MINDEN hozzávalójával
//             (séma, guard, DB-kapcsolat); a KÖZÖS ToolOutcome eggyel kintebb
//   trace / logger — MEGFIGYELHETŐSÉG: az élő színes nyom + a JSONL költség-napló
//   config  — a környezet validálása (fail-fast)
//
// A regressziós manifeszt (own-additions.spec.ts) EZEN a felületen dolgozik:
// ha egy export kimarad, hangosan törik, nem némán.

export * from './lib/user-role/user-role.js';

export * from './lib/agents/agent-loop.js';
export * from './lib/agents/query-agent/query-agent.js';
export * from './lib/agents/query-agent/query-prompt.js';
export * from './lib/agents/ingest-agent/ingest-agent.js';
export * from './lib/agents/ingest-agent/ingest-prompt.js';

export * from './lib/rag/chunk.js';
export * from './lib/rag/embed.js';
export * from './lib/rag/knowledge-store.js';
export * from './lib/rag/hyde.js';
export * from './lib/rag/rerank.js';
export * from './lib/rag/retrieve.js';

export * from './lib/tools/tool-outcome.js';
export * from './lib/tools/run-sql/run-sql-tool.js';
export * from './lib/tools/run-sql/sql-guard.js';
export * from './lib/tools/run-sql/db-readonly.js';
export * from './lib/tools/list-categories/list-categories-tool.js';
export * from './lib/tools/query-customers/query-customers-tool.js';
export * from './lib/tools/query-customers/customer-schema.js';
export * from './lib/tools/search-knowledge/search-knowledge-tool.js';
export * from './lib/tools/upsert-product/upsert-product-tool.js';
export * from './lib/tools/upsert-product/product-schema.js';
export * from './lib/tools/upsert-product/db-readwrite.js';
export * from './lib/tools/fetch-feed/fetch-feed-tool.js';
export * from './lib/tools/fetch-feed/shopify-feed.js';
export * from './lib/tools/delegate-to-ingest/delegate-to-ingest-tool.js';

export * from './lib/trace.js';
export * from './lib/logger.js';
export * from './lib/config.js';
export * from './lib/core.js';
