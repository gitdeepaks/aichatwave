# ADR-0004 — An owned `message` table beside the checkpoint

**Status:** Accepted · **Deciders:** owner

## Context

LangGraph's `PostgresSaver` already stores every conversation. For a while that was the only store:
history was read back with `agent.getState`, and the `message` table did not exist. The dev database
held 401 checkpoints, 936 checkpoint blobs and no message rows.

That is a serviceable prototype and an unserviceable product. A checkpoint is the _agent's_ state,
in the agent library's own schema:

- It cannot be paginated. `getState` returns a whole conversation, so a long thread loads entirely
  or not at all.
- It cannot be searched. Full-text search across a user's history is a query over a column, and
  there was no column — the text lived inside a serialized blob.
- It cannot be exported without reverse-engineering someone else's format.
- Its shape belongs to a dependency. A LangGraph upgrade that changes the serialization changes
  every conversation this product has ever had.

## Decision

Write an owned `message` table on every turn and **read from it**, keeping the checkpoint strictly
as agent state.

The two have different jobs and neither substitutes for the other. The checkpoint is what lets a
turn resume mid-generation; the `message` table is what the product is _about_. `message` carries a
generated `search_vector`, keyset pagination (50 at a time), the model id and token counts per row,
and the tool call parts as validated JSON.

Deleting a thread deletes both.

## Consequences

**Bought.** History pages. Search works (`/api/threads/search`, and the command palette on top of
it). Export to JSON and Markdown is a read of rows this app defined. Per-message cost is derivable
because the tokens are on the row. Account deletion can prove it removed everything, because
everything is in tables this schema declares.

**Cost.** Two writes per turn and two things that can disagree. They do disagree in one known way,
recorded in `docs/pro_plan.md`: **stopping a stream loses the turn** — the thread row is created and
no messages are written, so the question and the generated text are both lost, while the
`HumanMessage` remains in the checkpoint. The next turn therefore sees a question the transcript
does not show. That is open, and it is the direct cost of this split.

**Watch.** There is no backfill and no checkpoint fallback. A thread written before the `message`
table existed renders empty with its history stranded in a blob. Acceptable only because the
affected rows are development data.
