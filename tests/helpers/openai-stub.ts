/**
 * A stand-in for the OpenAI client `memory-service` extracts memories with.
 *
 * Import this *before* anything that reaches `@/server/memory/memory-service`:
 * that module constructs its client at load time, so a stub installed later
 * replaces nothing. Without it, the extraction tests reach the real API with a
 * placeholder key — a network round trip that fails, is swallowed as non-fatal,
 * and leaves the test passing without having tested the path.
 */

import "./environment";
import { stubModule } from "./module-stub";

type MemoryExtractionDecision = {
  should_write: boolean;
  memories: { text: string; is_new: boolean }[];
};

let decision: MemoryExtractionDecision | null = { should_write: false, memories: [] };

/**
 * What the next extraction call will decide. `null` is the model returning
 * nothing parseable, which the service treats as "store nothing".
 */
export function setMemoryExtraction(next: MemoryExtractionDecision | null): void {
  decision = next;
}

export const openAiCalls: string[] = [];

class StubOpenAI {
  readonly responses = {
    parse: () => {
      openAiCalls.push("responses.parse");
      return Promise.resolve({ output_parsed: decision });
    },
  };
}

stubModule("openai", { __esModule: true, default: StubOpenAI });
