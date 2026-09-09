/**
 * Embedding configuration for long-term memory.
 *
 * Shared by the runtime store and the migration script so the vector column's
 * dimensions can never drift from the model that writes into it.
 */

export const MEMORY_EMBEDDING_MODEL = "text-embedding-3-small";
export const MEMORY_EMBEDDING_DIMENSIONS = 1536;

/** Upper bound on memories injected into a system prompt. */
export const MEMORY_PROMPT_LIMIT = 32;
