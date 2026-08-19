-- A pgvector bekapcsolása. Ettől lesz a Postgresből vektor-adatbázis: EGY bővítmény,
-- nem egy új rendszer. Idempotens, tehát egy migrate reset után is lefut.
-- FIGYELEM: ennek a `knowledge_chunks` CREATE TABLE ELŐTT kell futnia, mert a tábla
-- `vector(1536)` oszlopa csak létező extensionnel értelmezhető.
CREATE EXTENSION IF NOT EXISTS "vector";

-- CreateTable
CREATE TABLE "knowledge_chunks" (
    "id" SERIAL NOT NULL,
    "source" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "chunk_index" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "embedding" vector(1536),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "knowledge_chunks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "knowledge_chunks_source_idx" ON "knowledge_chunks"("source");
