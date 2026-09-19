# ADR-0002 — LangGraph over the raw AI SDK agent loop

**Status:** Accepted · **Deciders:** owner

## Context

The AI SDK can run an agent by itself: `streamText` with tools, and a loop that feeds tool results
back until the model stops calling them. It is less code than a graph and it streams to
`useChat` natively.

What it does not give is a **checkpoint**. This product needs conversation state that survives the
process: a turn here keeps generating after its client disconnects — that is what makes a page
refresh resumable rather than destructive — and the state of a turn in flight has to live somewhere
a second request can pick it up from. It also needs a place to hang work that is not the answer:
memory extraction, usage ingestion, title generation.

## Decision

Run the agent as a LangGraph `StateGraph` (`server/chat/agent.ts`) with `PostgresSaver` for
checkpoints and `PostgresStore` for long-term memory, and adapt its event stream to the AI SDK's UI
protocol at the edge with `@ai-sdk/langchain`'s `toUIMessageStream`.

The graph is three nodes — `callLlm`, `tools`, `memoryRememberNode` — and the AI SDK keeps the job
it is genuinely best at: the wire format between server and `useChat`.

## Consequences

**Bought.** Durable conversation state in the same Postgres as everything else, so a turn is
recoverable and a reload reattaches to a live stream. A vector store with the same lifecycle as the
checkpointer. Per-node tracing that produces a real route → graph → LLM → tool span tree rather than
four unrelated spans.

**Cost.** Two type systems meeting in the middle, and the seam is where the bugs have been. The
adapter emits `tool-input-start` and never `tool-input-available`; the turn recorder handled only
the latter, so **no tool result was ever persisted** — the card rendered during the stream and was
gone on reload, in every thread in the database. The unit test agreed with the code and both
disagreed with the adapter. Recorded in `docs/pro_plan.md` under Phase I.

The second half of that same defect was also a seam: server-side the output chunk carries a live
LangChain `ToolMessage`, not the envelope the browser receives, and `z.json()` rejects a class
instance. `toJsonValue` in `lib/json.ts` normalizes through `JSON.stringify` for exactly this.

**Watch.** Anything that assumes the two libraries agree about a payload shape. The rule that came
out of this: chunk handling is verified against a sequence captured from a real turn, not against
what the types suggest.
