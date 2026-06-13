# Type-Safety Foundation Implementation Plan

Scope: implement only `Days 4-6: Type-Safety Foundation` from `docs/next_level_features.md`.

Goal: remove unsafe boundaries and stop future type debt. Every app-owned boundary must be validated or strongly typed. No `any`, no `as any`, no unsafe app/domain data assertions, and no direct unvalidated environment access.

## Non-Negotiable Rules

- Do not introduce `any` anywhere in app-owned code.
- Do not use `as any` anywhere.
- Do not use type assertions for app/domain data to bypass validation.
- Use Zod or explicit type guards at runtime boundaries.
- Prefer inferred types from schemas and registries over duplicated manual types.
- Validate external input before use: request bodies, params, environment variables, tool/API responses, and browser APIs when shape is uncertain.
- Keep third-party interop assertions only when unavoidable and guarded by runtime checks where possible.
- Use `unknown` instead of `any` for untrusted values, then narrow with schemas or guards.
- Do not silence TypeScript or ESLint errors with disable comments unless there is a documented, reviewed reason.

## Current Risk Areas

- `app/api/chat/route.ts` reads raw `await req.json()` and uses fields without validation.
- `app/api/chat/graph.ts` uses `runtime: any` and casts runtime context values.
- `app/api/chat/model.ts` keeps `ModelId` private, while client/store code uses plain `string`.
- `components/model-selector.tsx` casts `session?.user.id as string`.
- `app/(chat)/chat/[thread_id]/page.tsx` casts `thread_id as string`.
- `components/ai-elements/speech-input.tsx` casts speech result events.
- `components/ai-elements/prompt-input.tsx` uses avoidable assertions for `FileReader.result`, `FormData.get`, and submit button lookup.
- Direct `process.env.*` usage exists in server files and config files.
- `package.json` has no `typecheck` script.
- `eslint.config.mjs` does not explicitly ban `any` or `as any`.

## Phase 1: Add Typed Environment Validation

### 1. Create `lib/env.ts`

Create a single source of truth for environment variables.

Required behavior:

- Load all required server environment variables through a Zod schema.
- Reject missing strings and empty strings.
- Normalize values that need normalization, such as trimming trailing slashes from `BETTER_AUTH_URL`.
- Export a typed `env` object.
- Export a typed `publicEnv` object only for values safe to expose to client/browser code.
- Do not export raw `process.env`.
- Do not use non-null assertions like `process.env.DATABASE_URL!`.
- Do not use `as string` for environment values.

Environment variables to include:

- `DATABASE_URL`: required URL/string connection value.
- `OPENAI_API_KEY`: required non-empty string.
- `GOOGLE_API_KEY`: required non-empty string.
- `ANTHROPIC_API_KEY`: required non-empty string.
- `POLAR_ACCESS_TOKEN`: required non-empty string.
- `BETTER_AUTH_URL`: required URL, transformed to remove trailing slash.
- `GOOGLE_CLIENT_ID`: required non-empty string.
- `GOOGLE_CLIENT_SECRET`: required non-empty string.
- `GITHUB_CLIENT_ID`: required non-empty string.
- `GITHUB_CLIENT_SECRET`: required non-empty string.
- `SERP_API_KEY`: required non-empty string.
- `NEXT_PUBLIC_APP_URL`: optional URL.
- `VERCEL_URL`: optional host string.
- `NODE_ENV`: enum of `development`, `test`, `production`, optional default `development`.

Implementation requirements:

- Parse with `safeParse` or `parse` at module load.
- If parsing fails, throw an error with a clear message listing invalid keys.
- Keep error formatting typed. Do not type the error as `any`.
- If using `safeParse`, read `result.error.issues` from the failure branch only.

Acceptance criteria:

- Importing `env` gives correctly typed values.
- Missing required env vars fail fast at boot/config load.
- No direct `process.env.*` remains in app-owned runtime code after later phases.

### 2. Replace Direct Env Usage

Replace direct environment access in these files:

- `lib/auth.ts`
- `app/layout.tsx`
- `app/api/chat/tools.ts`
- `app/api/chat/model.ts`
- `app/api/chat/graph.ts`
- `http/llm.ts`
- `lib/store.ts`
- `db/index.ts`
- `drizzle.config.ts`

Required behavior:

- Use `env.DATABASE_URL`, `env.OPENAI_API_KEY`, etc.
- For `app/layout.tsx`, compute metadata base from typed env values.
- For `drizzle.config.ts`, use a relative import if path aliases are not available to Drizzle tooling.
- Keep `process.env` access only inside `lib/env.ts` unless a tool absolutely requires local parsing. If an exception is required, document it in this file and keep it typed.

Acceptance criteria:

- Search for `process.env.` returns only `lib/env.ts`, or a documented tooling exception.
- Search for `process.env.*!` returns zero app-owned matches.
- Search for `process.env.* as string` returns zero matches.

## Phase 2: Make Model IDs Strict End-To-End

### 3. Refactor `app/api/chat/model.ts`

Make the model registry the single source of truth.

Required exports:

- `MODEL_REGISTRY`
- `type ModelId`
- `type ModelConfig`
- `DEFAULT_MODEL_ID`
- `isModelId(value: unknown): value is ModelId`
- `getEffectiveModelId(value: unknown): ModelId`
- `getDynamicModel(modelId: ModelId): DynamicChatModel`

Required behavior:

- `ModelId` must be derived from the registry or otherwise guaranteed to match it.
- `getDynamicModel` must not accept arbitrary `string`.
- `getEffectiveModelId` may accept `unknown`, validate it, and return `DEFAULT_MODEL_ID` when invalid.
- Model provider and tier must be closed unions.
- Do not use fallback branches that hide impossible provider values. Exhaustive provider handling should be enforced with TypeScript.
- Replace model API key reads with typed `env` access.

Important current mismatch:

- Backend model registry has `gemini-3.1-pro`.
- UI selector currently has `gemini-3.1-pro-preview`.
- Pick one canonical ID and make frontend/backend match exactly.

Recommended canonical value:

- Use `gemini-3.1-pro` everywhere unless there is a product reason to use the preview ID.

Acceptance criteria:

- A mistyped model ID cannot be passed from store to API without validation.
- UI model list IDs must be typed as `ModelId`.
- Backend model selection cannot silently drift from frontend model options.

### 4. Type `store/chat-store.ts`

Required behavior:

- `selectedModel` must be typed as `ModelId`.
- `setSelectedModel` must accept only `ModelId`.
- `ChatRequestBody.selectedModel` must be `ModelId` when present.
- `isChatRequestBody(body: unknown)` must validate object shape and `selectedModel` using `isModelId`.
- `threadId` must be validated as a string before being used.
- Do not pass arbitrary model strings into chat transport body.

Acceptance criteria:

- `setSelectedModel("not-a-model")` fails at compile time.
- `selectedModel` sent by chat composer is a `ModelId`.

### 5. Type `components/model-selector.tsx`

Required behavior:

- Define model options with `id: ModelId`.
- `ModelItemProps.selectedModel` must be `ModelId`.
- `ModelItemProps.onSelect` must accept `ModelId`.
- Remove `session?.user.id as string`.
- Subscription query must not call `isCustomerHaveSubscription` without a real user ID.
- Query key should include `userId` to avoid stale cache between sessions.

Safe query pattern:

```ts
const userId = session?.user.id;

const { data: userHaveProPlan = false } = useQuery({
  queryKey: ["customer_subscription", userId],
  enabled: typeof userId === "string" && userId.length > 0,
  queryFn: async () => {
    if (typeof userId !== "string" || userId.length === 0) {
      return false;
    }
    return isCustomerHaveSubscription(userId);
  },
});
```

Acceptance criteria:

- No casts are needed to call subscription APIs.
- Locked model logic remains unchanged.
- Gemini model ID matches backend registry.

## Phase 3: Validate Chat API Input

### 6. Create `app/api/chat/schema.ts`

Define a runtime schema for the chat API request.

Required exports:

- `chatRequestSchema`
- `type ChatRequest`
- `chatRequestErrorCode`
- helper for formatting Zod validation issues into a client-safe response if useful.

Schema requirements:

- `threadId`: string, non-empty, ideally UUID if the app always uses UUID thread IDs.
- `messageContent`: string, trimmed, minimum length 1.
- `messageContent`: maximum length should be defined to prevent accidental abuse. Start with a reasonable limit such as `20_000` characters unless product requirements say otherwise.
- `selectedModel`: optional input accepted as unknown/string, validated with `isModelId`, then transformed/defaulted to `ModelId`.

Preferred result type:

```ts
type ChatRequest = {
  threadId: string;
  messageContent: string;
  selectedModel: ModelId;
};
```

Typed error response shape:

```ts
type ChatValidationErrorResponse = {
  error: {
    code: "INVALID_CHAT_REQUEST";
    message: string;
    issues: Array<{
      path: string;
      message: string;
    }>;
  };
};
```

Required behavior:

- Never expose stack traces or raw thrown errors to client.
- Return HTTP 400 for invalid JSON or invalid request shape.
- Keep validation helper fully typed. No `any` for Zod issues.

Acceptance criteria:

- Invalid payload returns typed 400.
- Empty message returns typed 400.
- Missing thread ID returns typed 400.
- Unknown selected model either returns typed 400 or defaults through a clearly documented rule. Prefer 400 if the client sent an invalid explicit value.

### 7. Refactor `app/api/chat/route.ts`

Required behavior:

- Parse request JSON into `unknown`.
- Validate with `chatRequestSchema` before using fields.
- Use parsed `threadId`, `messageContent`, and `selectedModel` only after validation.
- Use typed model config from `MODEL_REGISTRY[selectedModel]`.
- Remove `getEffectiveModelId(selectedModel)` if schema already guarantees `ModelId`.
- Return JSON error responses for validation and access failures where possible.
- Pass typed context to LangGraph.

Safe JSON parsing pattern:

```ts
let body: unknown;
try {
  body = await req.json();
} catch {
  return Response.json(
    {
      error: {
        code: "INVALID_JSON",
        message: "Request body must be valid JSON.",
      },
    },
    { status: 400 }
  );
}
```

LangGraph context target:

```ts
context: {
  userId: authData.user.id,
  selectedModel,
}
```

Acceptance criteria:

- No unvalidated request field is used.
- Chat API returns typed 400 for malformed input.
- Existing auth and subscription behavior remains intact.
- The selected model reaching graph context is a `ModelId`.

## Phase 4: Type LangGraph Runtime Context

### 8. Add Typed Runtime Context In `app/api/chat/graph.ts`

Required behavior:

- Remove `runtime: any` from all graph nodes.
- Define a context type for graph execution.
- Read `userId` and `selectedModel` through typed runtime context.
- Do not cast `runtime.context?.selectedModel as string`.
- Do not keep duplicate context fields like both `selectedModel` and `model` unless a library requires it. If required, type both explicitly.

Preferred types:

```ts
type ChatRuntimeContext = {
  userId: string;
  selectedModel: ModelId;
};

type ChatRuntime = {
  context?: Partial<ChatRuntimeContext>;
};
```

If LangGraph exports a runtime type, use that type instead of a local structural type, but do not use `any`.

Required node signatures:

```ts
const llmCall: GraphNode<typeof MessagesState> = async (
  state: typeof MessagesState.State,
  runtime: ChatRuntime
) => {
  // ...
};
```

If `GraphNode` does not accept a typed runtime parameter cleanly, use a named function with the exact parameter type expected by LangGraph and narrow its runtime input from `unknown`. Do not use `any`.

Acceptance criteria:

- `runtime: any` appears nowhere.
- `selectedModel` in `llmCall` is a `ModelId` before `getDynamicModel` is called.
- Memory node only writes when `userId` is a valid non-empty string.
- `pnpm typecheck` confirms graph node signatures.

## Phase 5: Replace Unsafe App-Owned UI Casts

### 9. Refactor Chat Page Params

File: `app/(chat)/chat/[thread_id]/page.tsx`

Required behavior:

- Remove `thread_id as string`.
- Validate the dynamic route param.
- If param is not a string or is empty, call `notFound()` or redirect safely.

Pattern:

```ts
const threadId = typeof thread_id === "string" ? thread_id : undefined;
if (!threadId) {
  notFound();
}
```

Acceptance criteria:

- `getConversationHistory` receives a definite string without assertion.

### 10. Refactor Speech Input Event Handling

File: `components/ai-elements/speech-input.tsx`

Required behavior:

- Remove direct `event as SpeechRecognitionEvent` if possible.
- Prefer typing the listener as a speech recognition event handler when DOM typings allow it.
- If browser API typings are incomplete, add a local type guard that checks required fields before use.
- Do not assume `result[0]` exists without checking.

Safe guard requirements:

- Verify `resultIndex` is a number.
- Verify `results` exists and has `length`.
- Verify each result has `isFinal` and transcript access before using.

Acceptance criteria:

- No unsafe speech event assertion remains.
- Speech transcription still appends final transcript only.

### 11. Refactor Prompt Input Assertions

File: `components/ai-elements/prompt-input.tsx`

Required changes:

- Replace `reader.result as string` with a runtime check:

```ts
const { result } = reader;
resolve(typeof result === "string" ? result : null);
```

- Replace `(formData.get("message") as string) || ""` with:

```ts
const value = formData.get("message");
return typeof value === "string" ? value : "";
```

- Replace submit button assertion with an `instanceof` guard:

```ts
const submitButton = form?.querySelector('button[type="submit"]');
if (submitButton instanceof HTMLButtonElement && submitButton.disabled) {
  return;
}
```

Acceptance criteria:

- Prompt input contains no avoidable app-data assertions.
- File conversion behavior remains unchanged.
- Enter-to-submit behavior remains unchanged.

## Phase 6: ESLint And Typecheck Enforcement

### 12. Add `typecheck` Script

File: `package.json`

Add:

```json
"typecheck": "tsc --noEmit"
```

Acceptance criteria:

- `pnpm typecheck` runs TypeScript without emitting files.

### 13. Tighten ESLint Rules

File: `eslint.config.mjs`

Required rules:

- Ban explicit `any`.
- Ban `as any`.
- Keep current project-specific React/Next rule overrides unless they are directly related to type safety.

Recommended initial config:

```js
rules: {
  "@typescript-eslint/no-explicit-any": "error",
  "no-restricted-syntax": [
    "error",
    {
      selector: "TSAsExpression > TSAnyKeyword",
      message: "Do not use `as any`. Validate or narrow from `unknown` instead.",
    },
  ],
}
```

Important:

- Do not globally ban every `as Type` in this phase because some UI/library interop may require narrow assertions like `as const` or `CSSProperties`.
- Do remove unsafe assertions from app-domain code and the targeted files listed above.

Acceptance criteria:

- `pnpm lint` fails on explicit `any`.
- `pnpm lint` fails on `as any`.
- Existing allowed third-party interop assertions do not block the whole project unless they are unsafe and app-owned.

## Phase 7: Audit For Remaining Loose Typing

### 14. Run Targeted Searches

Run searches after implementation:

```bash
rg "\bany\b|as any" --glob '*.{ts,tsx}'
rg "process\.env\." --glob '*.{ts,tsx,js,mjs}'
rg "as string" --glob '*.{ts,tsx}'
rg "runtime: any" --glob '*.{ts,tsx}'
```

Required results:

- `any` and `as any`: zero app-owned business logic matches.
- `process.env.`: only `lib/env.ts` or documented tooling exception.
- `as string`: zero in app/domain data flows. Any remaining third-party interop use must be reviewed and justified.
- `runtime: any`: zero matches.

### 15. Review Type Assertions Manually

Review remaining ` as ` matches in app-owned files.

Classification:

- Allowed: `as const` for literal inference.
- Allowed with caution: style objects like `as React.CSSProperties` when library types require it.
- Allowed with runtime guard: browser/third-party API interop where TypeScript cannot infer after a guard.
- Not allowed: request body casts, route param casts, session/user casts, model ID casts, env casts, database result casts, tool output casts.

Acceptance criteria:

- Every remaining assertion is either safe literal inference, library interop, or documented with a guard.
- No app/domain data relies on assertions instead of validation.

## Phase 8: Verification

### 16. Run Required Commands

Run:

```bash
pnpm typecheck
pnpm lint
pnpm test
```

Required result:

- All commands pass.

If a command fails:

- Fix the root typing issue.
- Do not loosen types to make it pass.
- Do not add `any`.
- Do not add `as any`.
- Do not suppress lint rules without explicit approval.

### 17. Verify Chat API Invalid Payloads

Manually or with tests, verify these cases return typed 400 responses:

- Empty JSON body.
- Invalid JSON body.
- Missing `threadId`.
- Empty `threadId`.
- Missing `messageContent`.
- Empty `messageContent`.
- Non-string `messageContent`.
- Invalid explicit `selectedModel`.

Expected response format:

```json
{
  "error": {
    "code": "INVALID_CHAT_REQUEST",
    "message": "Invalid chat request.",
    "issues": []
  }
}
```

For invalid JSON, use:

```json
{
  "error": {
    "code": "INVALID_JSON",
    "message": "Request body must be valid JSON."
  }
}
```

### 18. Verify Valid Chat Flow

Verify:

- Free model chat still streams.
- Pro model stays locked for non-pro users.
- Pro model access still works for subscribed users.
- Thread creation still works.
- Existing thread ownership protection still works.
- Memory read/write stays non-fatal and logged.

## Final Acceptance Criteria

- `pnpm typecheck` passes.
- `pnpm lint` passes with strict no-explicit-any enforcement.
- `pnpm test` passes.
- Chat API returns typed 400 errors for invalid payloads.
- No `runtime: any` remains.
- No `as any` remains.
- No app-owned business logic uses `any`.
- No direct unvalidated `process.env.*` usage remains outside the env module or documented tooling exception.
- `ModelId` is exported and used end-to-end from model selector to store to chat route to graph runtime.
- Unsafe casts in model selector, chat page params, speech input, and prompt input are replaced with guards or typed helpers.

## Out Of Scope For Days 4-6

- Database redesign.
- Tool output normalization for every external API response.
- Full CI workflow.
- New test framework setup beyond existing command verification.
- Backend service-layer refactor.
- Observability/logging refactor.

These belong to later phases in `docs/next_level_features.md`.
