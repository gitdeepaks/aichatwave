# Stabilize Chat UX And Scrolling

## Goal

Make AIChatWave's core chat experience feel stable, premium, and predictable before adding more product features. The user should be able to submit, stream, scroll, recover, and continue conversations without fighting the interface on desktop or mobile.

This work implements Point 1 from `docs/next_level_features.md`: Days 1-3, Stabilize Chat UX And Scrolling.

## Current Problems

The current chat implementation works, but the responsibilities are spread across too many places:

- `components/chat-interface.tsx` owns hydration, empty state layout, conversation layout, input placement, message rendering, and error toasts.
- `components/ai-elements/conversation.tsx` owns context, scroll container refs, scroll event handling, bottom detection, and the scroll-to-bottom button.
- `components/ai-elements/conversation-auto-scroll.tsx` adds another scroll listener and programmatic scroll behavior.
- `components/input-container.tsx` owns thread creation, prompt state, submit behavior, keyboard-adjacent behavior, speech input, route navigation, and button state.

The result is fragile because there is no single scroll owner. Auto-scroll, user scroll intent, streaming anchoring, and the floating scroll button can disagree.

## Product Principles

- One component or hook should own one concern.
- Scroll behavior must respect user intent above everything else.
- Streaming should feel anchored only when the user is already reading the newest message.
- New user submissions should always become visible immediately.
- Mobile keyboard behavior must be treated as a first-class layout requirement.
- Empty state should guide the user with useful starting points, not only a placeholder.
- Visible states should clearly explain what the assistant is doing.
- The implementation should be modular and testable, not concentrated in one large file.

## Target Architecture

Create a dedicated chat feature module and keep the low-level reusable `ai-elements` components simple.

Recommended directory:

```txt
components/chat/
  chat-shell.tsx
  chat-empty-state.tsx
  chat-message-list.tsx
  chat-scroll-button.tsx
  chat-status-bar.tsx
  chat-composer.tsx
  prompt-starter-card.tsx
  hooks/
    use-chat-scroll-controller.ts
    use-chat-composer.ts
    use-chat-viewport.ts
    use-chat-visible-status.ts
  utils/
    chat-scroll.ts
    chat-status.ts
  types.ts
```

Keep existing shared primitives in:

```txt
components/ai-elements/
  conversation.tsx
  prompt-input.tsx
  message.tsx
  speech-input.tsx
```

The feature module should compose primitives. It should not push app-specific behavior into generic `ai-elements` unless the behavior is truly reusable.

## Proposed Responsibilities

### `components/chat/chat-shell.tsx`

Main layout component for the chat page.

Responsibilities:

- Own the high-level two-state layout: empty chat and active conversation.
- Use `useChat` and pass only necessary data/actions down.
- Convert old messages and hydrate without visual mismatch.
- Render `ChatEmptyState`, `ChatMessageList`, `ChatComposer`, and `ChatStatusBar`.
- Keep `chat-interface.tsx` as a thin wrapper or replace it with `ChatShell`.

Non-responsibilities:

- No direct scroll math.
- No prompt textarea implementation details.
- No message rendering internals beyond passing messages/status.

### `components/chat/chat-message-list.tsx`

Conversation viewport and message rendering wrapper.

Responsibilities:

- Render the scroll container.
- Attach the ref and handlers from `useChatScrollController`.
- Render `MessageRenderer`.
- Render `ChatScrollButton`.
- Reserve bottom padding so the input never overlaps final assistant content.
- Add proper accessibility attributes for streamed updates.

Recommended accessibility:

- Use `role="log"` on the message list region.
- Use `aria-live="polite"` for assistant updates.
- Use `aria-relevant="additions text"`.
- Avoid stealing focus on every streamed token.

### `components/chat/hooks/use-chat-scroll-controller.ts`

Single owner for scroll behavior.

Responsibilities:

- Own `scrollRef`.
- Track whether the user is near bottom.
- Track whether the user has intentionally left the bottom.
- Track previous message count and previous last message id.
- Scroll instantly on a new user-submitted message.
- Keep streaming assistant output anchored only when the user is near bottom.
- Preserve user scroll position when older/history messages are prepended or hydrated.
- Expose `scrollToBottom`, `showScrollButton`, `isNearBottom`, and `onScroll`.

Suggested return shape:

```ts
type ChatScrollController = {
  scrollRef: RefObject<HTMLDivElement | null>;
  isNearBottom: boolean;
  showScrollButton: boolean;
  onScroll: UIEventHandler<HTMLDivElement>;
  scrollToBottom: (behavior?: ScrollBehavior) => void;
};
```

Implementation rules:

- Do not add a second scroll listener in another component.
- Use `useLayoutEffect` for scroll correction that must happen before paint.
- Use `requestAnimationFrame` when anchoring during streaming to avoid layout thrash.
- Use distance from bottom, not exact equality.
- Keep thresholds named and centralized.

Recommended constants:

```ts
const NEAR_BOTTOM_PX = 96;
const LEAVE_BOTTOM_PX = 140;
const PROGRAMMATIC_SCROLL_QUIET_MS = 180;
```

Expected behavior matrix:

| Event | User near bottom | User reading above | Behavior |
| --- | --- | --- | --- |
| New user message submitted | Yes | Yes | Instant scroll to bottom |
| Assistant starts streaming | Yes | No | Stay anchored only if near bottom |
| Assistant token arrives | Yes | No | Smooth or auto bottom lock only near bottom |
| User scrolls up during stream | No | Yes | Stop forcing bottom |
| User clicks bottom button | Yes | Yes | Scroll to bottom and resume anchoring |
| History hydrates | Preserve | Preserve | Avoid flicker and unexpected jumps |

### `components/chat/utils/chat-scroll.ts`

Pure scroll helpers.

Responsibilities:

- Calculate distance from bottom.
- Determine near-bottom state.
- Capture and restore scroll anchors when content height changes.

Example helpers:

```ts
export function getDistanceFromBottom(element: HTMLElement): number;
export function isWithinBottomThreshold(element: HTMLElement, thresholdPx: number): boolean;
export function getScrollAnchor(element: HTMLElement): { scrollHeight: number; scrollTop: number };
export function restoreScrollAnchor(element: HTMLElement, anchor: ScrollAnchor): void;
```

### `components/chat/chat-scroll-button.tsx`

Scroll-to-bottom affordance.

Responsibilities:

- Render only when `showScrollButton` is true.
- Stay above the input/composer area.
- Use a clear accessible label such as `Scroll to latest message`.
- Respect reduced motion by using instant or minimal animation when needed.

### `components/chat/chat-composer.tsx`

App-specific prompt composer.

Responsibilities:

- Own prompt text state through `useChatComposer`.
- Disable submit while input is empty or chat is busy.
- Support `Cmd/Ctrl+Enter` to submit.
- Support `Enter` to submit if the existing `PromptInputTextarea` behavior expects it.
- Support `Shift+Enter` for newline.
- Wire speech transcription into the input, or hide speech input until it works.
- Own thread id generation and route push, or delegate those to `useChatComposer`.

Important fix:

- Current `SpeechInput` has `onTranscriptionChange={(text) => {}}`. This is visibly incomplete. Either append/replace the prompt text with the transcribed text, or temporarily remove/hide the button behind a feature flag until it is functional.

Recommended speech behavior:

- If input is empty, set input to transcription.
- If input has text, append a space plus transcription.
- Keep focus in the textarea after transcription.

### `components/chat/hooks/use-chat-composer.ts`

Composer state and submit orchestration.

Responsibilities:

- Manage `input`.
- Compute `canSubmit`.
- Compute `isBusy` from `ChatStatus`.
- Build the `sendMessage` payload with `threadId` and `selectedModel`.
- Clear input after successful submit.
- Push to `/chat/[threadId]` after first message.
- Expose `handleSubmit`, `handleKeyDown`, and `handleTranscriptionChange`.

Submit safeguards:

- Trim and reject empty input.
- Do not submit while `submitted` or `streaming`.
- Keep `Shift+Enter` as newline.
- Treat `Meta+Enter` and `Ctrl+Enter` as explicit submit shortcuts.

### `components/chat/hooks/use-chat-viewport.ts`

Mobile viewport and keyboard stabilization.

Responsibilities:

- Read `window.visualViewport` when available.
- Expose composer-safe bottom offset.
- Update CSS variable values on resize and keyboard open/close.
- Avoid hardcoding `100vh` for mobile chat height.

Recommended CSS variables:

```css
--chat-viewport-height: 100dvh;
--chat-composer-height: 0px;
--chat-safe-bottom: env(safe-area-inset-bottom);
```

Mobile layout rules:

- Prefer `100dvh` over `100vh`.
- Add `pb-[env(safe-area-inset-bottom)]` or equivalent on fixed/sticky bottom areas.
- Keep the composer inside the page layout when possible instead of using fixed positioning.
- If sticky positioning is needed, reserve matching bottom padding in the message list.

### `components/chat/chat-status-bar.tsx`

Visible assistant state component.

Responsibilities:

- Show concise status near the composer or bottom of message list.
- Avoid noisy indicators that compete with streamed content.
- Provide retry affordance when there is an error.

States to represent:

| Source | UI copy |
| --- | --- |
| `submitted` | `Sending...` or `Thinking...` |
| `streaming` | `Writing response...` |
| active tool part | `Using tools...` with specific tool copy where available |
| `error` | `Message failed. Retry available.` |
| ready after error | `Retry` action visible |

Tool status examples:

- `display_products`: `Searching products...`
- `display_weather`: `Fetching weather...`
- `display_news`: `Reading market news...`

### `components/chat/hooks/use-chat-visible-status.ts`

Derive UI status from `ChatStatus`, `error`, and message parts.

Responsibilities:

- Convert low-level chat state into human-readable UI state.
- Detect tool parts that are not `output-available` yet.
- Provide a stable discriminated union for rendering.

Suggested type:

```ts
type ChatVisibleStatus =
  | { kind: "idle" }
  | { kind: "submitted"; label: string }
  | { kind: "streaming"; label: string }
  | { kind: "tool-running"; label: string; toolName: string }
  | { kind: "error"; label: string; retryLabel: string };
```

### `components/chat/chat-empty-state.tsx`

Premium empty state with prompt starters.

Responsibilities:

- Replace the generic empty area in `chat-interface.tsx`.
- Show a strong AIChatWave identity and useful starter cards.
- Let starter cards populate and submit or populate the composer.
- Keep the visual direction aligned with the existing dark, glassy, orange-accented product language.

Recommended prompt starter categories:

- `Code`: `Review this component for bugs and edge cases.`
- `Research`: `Compare the best options for...`
- `Products`: `Find and compare products for...`
- `Market`: `Give me a concise market update on...`
- `Planning`: `Turn this idea into a 7-day execution plan.`

Design standards:

- Use specific copy, not generic AI assistant language.
- Make cards keyboard focusable.
- Add hover/focus states with clear contrast.
- Keep motion subtle and respect `prefers-reduced-motion`.
- Avoid introducing a totally different visual system for the empty state.

## Implementation Phases

### Phase 1: Extract Chat Feature Module

Files to create:

```txt
components/chat/chat-shell.tsx
components/chat/chat-empty-state.tsx
components/chat/chat-message-list.tsx
components/chat/chat-composer.tsx
components/chat/chat-scroll-button.tsx
components/chat/chat-status-bar.tsx
components/chat/types.ts
```

Files to update:

```txt
components/chat-interface.tsx
```

Steps:

- Move the active chat layout out of `chat-interface.tsx` into `ChatShell`.
- Move the empty state markup into `ChatEmptyState`.
- Move input-specific app behavior from `InputContainer` into `ChatComposer` or `useChatComposer`.
- Keep `chat-interface.tsx` small enough to only adapt existing props and render the new shell.

Acceptance criteria:

- `chat-interface.tsx` is no longer the dumping ground for layout, hydration, empty state, input, and scroll concerns.
- The app renders the same route successfully after extraction.

### Phase 2: Replace Split Scroll Ownership

Files to create:

```txt
components/chat/hooks/use-chat-scroll-controller.ts
components/chat/utils/chat-scroll.ts
```

Files to update:

```txt
components/chat/chat-message-list.tsx
components/ai-elements/conversation.tsx
components/ai-elements/conversation-auto-scroll.tsx
```

Steps:

- Implement `useChatScrollController` as the only source of scroll behavior.
- Remove `ConversationAutoScroll` from the active chat render path.
- Simplify `Conversation` so it can remain a visual primitive, or bypass it in `ChatMessageList` if the primitive keeps too much behavior.
- Ensure only one `onScroll` handler updates near-bottom state.
- Implement instant bottom scroll on new user message.
- Implement bottom anchoring during streaming only when near bottom.
- Implement scroll button visibility from controller state.

Acceptance criteria:

- User can scroll up while assistant streams and is not forced down.
- If the user is near bottom, streaming remains visually anchored.
- New user submission scrolls into view immediately.
- No duplicate scroll listeners are needed for normal chat behavior.

### Phase 3: Stabilize Composer And Keyboard Behavior

Files to create:

```txt
components/chat/hooks/use-chat-composer.ts
components/chat/hooks/use-chat-viewport.ts
```

Files to update:

```txt
components/chat/chat-composer.tsx
components/input-container.tsx
components/ai-elements/prompt-input.tsx
```

Steps:

- Move submit and route logic into `useChatComposer`.
- Ensure submit is disabled for empty input and busy states.
- Add explicit `Cmd/Ctrl+Enter` submit support.
- Preserve `Shift+Enter` newline behavior.
- Wire speech transcription into the prompt input or hide the speech button.
- Use `useChatViewport` to stabilize mobile viewport height and safe area.
- Ensure final assistant content is never hidden under the composer.

Acceptance criteria:

- Empty submit is impossible by button or keyboard.
- `Shift+Enter` creates a newline.
- `Cmd/Ctrl+Enter` submits.
- Speech input is not a dead UI control.
- Mobile keyboard does not cause the composer to overlap the last message.

### Phase 4: Add Visible States And Prompt Starters

Files to create:

```txt
components/chat/hooks/use-chat-visible-status.ts
components/chat/prompt-starter-card.tsx
components/chat/utils/chat-status.ts
```

Files to update:

```txt
components/chat/chat-empty-state.tsx
components/chat/chat-status-bar.tsx
components/custom/message-renderer.tsx
```

Steps:

- Derive submitted, streaming, tool-running, error, and retry states.
- Show tool-running state for dynamic tool parts before output is available.
- Add a retry affordance for failed responses if the AI SDK chat instance exposes retry/regenerate support.
- Add prompt starter cards and wire them into the composer.
- Keep the existing typing dots, but avoid duplicating status indicators in a noisy way.

Acceptance criteria:

- The user can tell when the app is sending, thinking, streaming, using a tool, or failed.
- Empty state offers useful starting points.
- Error state includes a visible recovery path.

### Phase 5: Verification And Regression Protection

Manual QA checklist:

- Start a new chat from empty state.
- Submit with button.
- Submit with `Cmd+Enter` or `Ctrl+Enter`.
- Add multiline input with `Shift+Enter`.
- Confirm empty input cannot submit.
- Send enough messages to create a long conversation.
- Scroll up during streaming and confirm the viewport does not snap down.
- Click scroll-to-bottom and confirm streaming anchors again.
- Open an existing thread and confirm no hydration flicker.
- Test desktop Chrome/Safari.
- Test mobile Safari or responsive device emulation with keyboard open.
- Trigger an API error and confirm the error state is visible and recoverable.

Recommended automated tests:

- Unit test `chat-scroll.ts` threshold helpers.
- Unit test `useChatVisibleStatus` state derivation.
- Component test composer submit gating and keyboard behavior.
- Component test scroll button visibility when not near bottom.
- Playwright test for long conversation scroll behavior with mocked streaming.

## Detailed Scroll Algorithm

Use message identity and role transitions instead of only status.

Track:

- `previousMessageCountRef`
- `previousLastMessageIdRef`
- `wasNearBottomRef`
- `userHasLeftBottomRef`
- `programmaticScrollUntilRef`
- `previousScrollHeightRef`

On scroll:

- If inside the programmatic quiet window, update refs but do not mark user intent.
- Compute `distanceFromBottom`.
- Set `isNearBottom` when distance is within `NEAR_BOTTOM_PX`.
- If distance exceeds `LEAVE_BOTTOM_PX`, mark `userHasLeftBottomRef` as true.
- If the user returns near bottom, mark `userHasLeftBottomRef` as false.

On new user message:

- Scroll to bottom instantly.
- Set a short programmatic quiet window.
- Clear `userHasLeftBottomRef`.

On assistant streaming update:

- If user has not left bottom and was near bottom, schedule scroll to bottom in `requestAnimationFrame`.
- If user has left bottom, do nothing.

On history hydration/prepend:

- Capture previous `scrollHeight` and `scrollTop` before content changes when possible.
- After content changes, restore `scrollTop` by the height delta.
- Do not force bottom unless this is a new outgoing user message.

## Layout Standards

Recommended active chat structure:

```tsx
<section className="flex min-h-0 flex-1 flex-col overflow-hidden">
  <ChatMessageList />
  <ChatComposer />
</section>
```

Message list rules:

- It owns vertical scrolling.
- It has `min-h-0` at every flex boundary.
- It has enough bottom padding to account for composer height.
- It uses `overscroll-contain` or equivalent to avoid body scroll chaining.
- It avoids nested vertical scroll containers.

Composer rules:

- It is a sibling of the message list, not inside the scrollable content.
- It has safe-area bottom padding on mobile.
- It should not be `position: fixed` unless the rest of the layout reserves its height.
- It should remain reachable when the visual viewport shrinks.

## TypeScript Standards

- Do not introduce `any`.
- Do not use broad type assertions for app/domain data.
- Keep hook return types explicit where they define public component contracts.
- Prefer discriminated unions for visible chat status.
- Keep pure utilities in `utils` so they are easy to test.
- Keep client-only hooks in files with clear browser API guards.

## Design Standards

- Preserve the current refined dark glass aesthetic with warm orange accents.
- Avoid generic chat UI patterns that feel like an unstyled wrapper around an SDK.
- Use crisp state labels and purposeful microinteractions.
- Prompt starters should feel like product capabilities, not placeholder suggestions.
- All interactive controls need visible focus states and accessible labels.
- Respect `prefers-reduced-motion` for animated typing, scrolling, and hover effects.

## Acceptance Criteria

- Long conversations scroll naturally on desktop and mobile.
- User can scroll up during streaming without being forced to bottom.
- New submitted message scrolls into view instantly.
- Input stays fixed in the layout and never overlaps final assistant content.
- No hydration flicker in chat history.
- Empty state includes useful prompt starter cards.
- Speech input is functional or hidden.
- Submit behavior supports empty-state prevention, `Cmd/Ctrl+Enter`, and `Shift+Enter` correctly.
- Visible states cover submitted, streaming, tool running, error, and retry available.
- Chat-related code is split into focused subcomponents and hooks under `components/chat/`.

## Current Implementation Audit

This section reflects the current codebase state after completing and verifying the Days 1-3 stabilization pass.

### Implemented

The core architecture and remaining production-hardening gaps from this plan are now implemented.

- `components/chat-interface.tsx` is now a thin wrapper that renders `ChatShell`.
- `components/chat/` exists as the dedicated feature module.
- `ChatShell` owns the high-level empty vs active conversation layout.
- `ChatMessageList` owns the active message viewport and renders `MessageRenderer`.
- `ChatComposer` owns the app-specific composer UI.
- `ChatEmptyState` exists and includes prompt starter cards.
- `PromptStarterCard` provides keyboard-focusable starter actions.
- `ChatScrollButton` exists with an accessible label.
- `ChatStatusBar` exists for submitted, streaming, tool-running, and error state labels.
- `useChatScrollController` exists and is now the main scroll owner in the active render path.
- `ConversationAutoScroll` is no longer used by the active chat UI.
- `useChatComposer` owns prompt input state, thread id handling, submit payload construction, and route push.
- `useChatVisibleStatus` derives user-facing state from `ChatStatus`, errors, and dynamic tool parts.
- `useChatViewport` exists and reads `window.visualViewport`.
- The active chat shell consumes `--chat-viewport-height` with a `100dvh` fallback for mobile keyboard stability.
- `useChatViewport` measures the composer with `ResizeObserver` and writes `--chat-composer-height`.
- `ChatMessageList` uses `--chat-composer-height` for dynamic bottom padding instead of static padding.
- `chat-scroll.ts` contains pure helpers for distance-from-bottom and scroll anchoring.
- `chat-status.ts` maps known tool names to readable tool-running labels.
- `chat-status.ts` exposes `getChatVisibleStatus` for deterministic status testing.
- `usePrefersReducedMotion` disables smooth scroll behavior for users who request reduced motion.
- Speech input is wired into the prompt text through `handleTranscriptionChange`.
- Speech transcription returns focus to the textarea.
- Empty submit is prevented by `canSubmit`.
- Busy-state submit is prevented while `status` is `submitted` or `streaming`.
- `Shift+Enter` newline behavior is preserved by `PromptInputTextarea`.
- `Cmd/Ctrl+Enter` explicit submit support is implemented in `useChatComposer`.
- `ChatMessageList` uses `role="log"`, `aria-live="polite"`, and `aria-relevant="additions text"`.
- Interactive buttons now have accessible labels and visible focus styles in the new chat components.
- Error retry is an actionable button wired to chat regeneration and error clearing.
- Existing thread/history mount scrolls to the latest message once, while new user messages still scroll instantly.
- The stale `components/input-container.tsx` implementation has been removed so chat input behavior has one source of truth.
- `tests/chat-status.test.ts` covers visible chat status derivation.
- `tests/chat-scroll.test.ts` covers pure scroll utility behavior.
- Verification completed with `pnpm test`, `pnpm lint`, and `pnpm tsc --noEmit`.

### Partially Implemented

No known implementation gaps remain in the scoped Days 1-3 code. Browser-specific behavior should still be included in normal release QA because mobile keyboard and streaming behavior depend on real browser layout engines.

### Not Implemented Yet

- Playwright coverage for long conversation scroll behavior with mocked streaming remains recommended as a future regression-hardening task.
- Manual QA evidence for desktop Chrome, desktop Safari, mobile Safari, and keyboard-open responsive behavior remains recommended before production release.

## Remaining Work Implementation Plan

The remaining work should be completed in small, verifiable steps. Each step should keep behavior isolated in the `components/chat/` feature module and avoid pushing app-specific logic back into generic `ai-elements` primitives.

### Step 1: Make Mobile Viewport Height Real

Problem:

- `useChatViewport` writes `--chat-viewport-height`, but the active chat shell does not use it.
- On mobile Safari and Chrome, `100vh`-like layouts can become unstable when the keyboard opens.

Industry-standard approach:

- Use `100dvh` as the baseline for modern browsers.
- Use `window.visualViewport.height` as a runtime fallback for keyboard-open states.
- Apply the computed height at the chat shell boundary, not deep inside individual children.
- Keep the composer in normal layout flow instead of fixed positioning whenever possible.

Implementation steps:

1. Update `useChatViewport` to set both height and keyboard offset variables:

```ts
root.style.setProperty("--chat-viewport-height", `${viewportHeight}px`);
root.style.setProperty("--chat-keyboard-offset", `${Math.max(0, window.innerHeight - viewportHeight)}px`);
root.style.setProperty("--chat-safe-bottom", "env(safe-area-inset-bottom)");
```

2. Apply the variable in the top-level chat page/shell container:

```tsx
<div className="flex min-h-0 flex-1 flex-col overflow-hidden min-[0px]:h-[var(--chat-viewport-height)]">
```

3. Prefer a clearer Tailwind pattern if supported by the project:

```tsx
<div className="flex h-dvh min-h-0 flex-1 flex-col overflow-hidden [height:var(--chat-viewport-height)]">
```

4. Verify that the chat body, message list, and composer all sit inside the same flex column.

5. Avoid nested scroll containers outside `ChatMessageList`.

Acceptance criteria:

- Opening the mobile keyboard does not hide the composer.
- Closing the keyboard restores the available height.
- The body does not become the primary scroll container while chatting.
- The message list remains the only vertical scroll area for conversation content.

### Step 2: Measure Composer Height And Reserve Exact Message Padding

Problem:

- `ChatMessageList` currently uses static `pb-24`.
- Static padding will break when the composer grows, status bar appears, safe-area inset changes, or viewport size changes.

Industry-standard approach:

- Measure the real composer height with `ResizeObserver`.
- Store the value in a CSS variable such as `--chat-composer-height`.
- Use that variable as bottom padding in the message list.
- Keep measurement local to chat layout and avoid global hardcoded padding.

Implementation steps:

1. Create a hook:

```txt
components/chat/hooks/use-chat-composer-measure.ts
```

2. Hook API:

```ts
type ChatComposerMeasure = {
  composerRef: RefObject<HTMLDivElement | null>;
};
```

3. Use `ResizeObserver` inside the hook:

```ts
useLayoutEffect(() => {
  const element = composerRef.current;
  if (!element) return;

  const update = () => {
    document.documentElement.style.setProperty(
      "--chat-composer-height",
      `${element.getBoundingClientRect().height}px`,
    );
  };

  update();
  const observer = new ResizeObserver(update);
  observer.observe(element);

  return () => observer.disconnect();
}, []);
```

4. Pass `composerRef` to the root element in `ChatComposer`.

5. Replace static `pb-24` in `ChatMessageList` with dynamic padding:

```tsx
className="mx-auto flex w-full max-w-3xl flex-col gap-5 px-3 py-5 pb-[calc(var(--chat-composer-height,6rem)+1.5rem)] sm:px-4"
```

6. Keep the composer as a sibling of the message list, not absolutely positioned over the list.

Acceptance criteria:

- Last assistant message is visible above the composer at all composer heights.
- Showing `ChatStatusBar` does not overlap final content.
- Multiline input growth does not cover the last message.
- Safe-area bottom padding works on mobile devices with home indicators.

### Step 3: Fix Scroll Anchor Preservation

Problem:

- The current `previousAnchorRef` is captured in a layout effect without dependencies. That can happen after render, which is too late for reliable height-delta restoration when history is hydrated or prepended.

Industry-standard approach:

- Capture the anchor before the data update that changes list height when possible.
- If true prepend loading is introduced later, capture the first visible message id and offset, not only scroll height.
- For the current implementation, use a previous-render snapshot carefully and only restore on known history/hydration transitions.

Implementation steps:

1. Replace the always-running anchor capture with a previous-render snapshot ref updated at the end of the layout effect.

2. Track these values:

```ts
const previousSnapshotRef = useRef<{
  messageCount: number;
  lastMessageId: string | undefined;
  scrollHeight: number;
  scrollTop: number;
} | null>(null);
```

3. At the start of the layout effect, read the previous snapshot before mutating scroll:

```ts
const previousSnapshot = previousSnapshotRef.current;
```

4. Detect hydration/prepend separately from normal append:

```ts
const isInitialHydration = previousSnapshot?.messageCount === 0 && messages.length > 0;
const isPrepend = previousSnapshot && messages.length > previousSnapshot.messageCount && lastMessage?.id === previousSnapshot.lastMessageId;
```

5. Restore by height delta only for prepend-like changes:

```ts
if (isPrepend && previousSnapshot) {
  const heightDelta = element.scrollHeight - previousSnapshot.scrollHeight;
  element.scrollTop = previousSnapshot.scrollTop + heightDelta;
}
```

6. For initial hydration, choose explicit product behavior:

- Existing thread: preserve top if rendering old history before interaction.
- Newly opened latest conversation: scroll to bottom after hydration if the expected user intent is to continue from the latest message.

Recommended behavior for this app:

- On opening an existing thread, scroll to bottom once after history loads because chat apps usually resume at the latest message.
- Do not show a visual jump during hydration; render the hydrated list only after messages are set.

7. At the end of the layout effect, update the snapshot:

```ts
previousSnapshotRef.current = {
  messageCount: messages.length,
  lastMessageId: messages.at(-1)?.id,
  scrollHeight: element.scrollHeight,
  scrollTop: element.scrollTop,
};
```

Acceptance criteria:

- Opening an existing thread does not flicker.
- Future prepend/history loading does not jump the user away from the message they were reading.
- New user messages still force an instant scroll to bottom.
- Streaming still anchors only when the user is near bottom.

### Step 4: Make Retry A Real Action

Problem:

- The current error state displays `Retry`, but it is not clickable and no retry action is passed down.

Industry-standard approach:

- Retry must be an explicit user action with clear disabled/loading states.
- The retry handler should live near `useChat`, because that is where the AI SDK chat instance capabilities are available.
- The status bar should be a presentational component that receives `onRetry` only when retry is possible.

Implementation steps:

1. Inspect the AI SDK `useChat` return value for retry/regenerate support used by the installed version.

2. If a built-in retry/regenerate function exists, expose it from `ChatShell`:

```ts
const { messages, setMessages, sendMessage, status, error, regenerate } = useChat(...);
```

3. Pass the handler to `ChatComposer` or directly to `ChatStatusBar`:

```tsx
<ChatComposer onRetry={regenerate} />
```

4. Update `ChatStatusBar` props:

```ts
type ChatStatusBarProps = {
  status: ChatVisibleStatus;
  onRetry?: () => void | Promise<void>;
};
```

5. Render a button instead of static retry text:

```tsx
{isError && onRetry ? (
  <button type="button" onClick={onRetry}>Retry</button>
) : null}
```

6. If the AI SDK version does not expose retry, implement app-level retry by resending the last user message with the same `threadId` and `selectedModel`.

7. Prevent duplicate retry while `submitted` or `streaming`.

Acceptance criteria:

- Error state includes a clickable retry action.
- Retry is disabled or hidden while another response is in progress.
- Retry either regenerates the failed assistant response or resends the last user prompt predictably.
- Retry failure produces a clear error state again.

### Step 5: Respect Reduced Motion For Programmatic Scrolling

Problem:

- `ChatScrollButton` calls `scrollToBottom("smooth")` unconditionally.
- Users with reduced motion enabled should not receive smooth animated scrolling.

Industry-standard approach:

- Detect `prefers-reduced-motion` through a small reusable hook or utility.
- Use `auto` scroll behavior when reduced motion is requested.
- Keep CSS animations disabled through Tailwind `motion-reduce` classes.

Implementation steps:

1. Create a small hook:

```txt
components/chat/hooks/use-prefers-reduced-motion.ts
```

2. Implement with `window.matchMedia("(prefers-reduced-motion: reduce)")`.

3. In `ChatMessageList`, choose behavior:

```ts
const scrollBehavior = prefersReducedMotion ? "auto" : "smooth";
```

4. Use that value for the scroll button:

```tsx
<ChatScrollButton show={showScrollButton} onClick={() => scrollToBottom(scrollBehavior)} />
```

5. Keep submit and streaming scrolls as `auto`, because those are state-correction scrolls rather than decorative animations.

Acceptance criteria:

- Users with reduced motion enabled do not get smooth scroll animation.
- Streaming remains stable and not visually jumpy.
- Scroll-to-bottom remains discoverable and accessible.

### Step 6: Remove Or Retire Stale `InputContainer`

Problem:

- `components/input-container.tsx` still contains the old implementation.
- It includes the old dead speech callback and duplicates behavior now owned by `ChatComposer` and `useChatComposer`.

Industry-standard approach:

- Avoid keeping stale duplicate implementations around because they become misleading and drift from the product behavior.
- Before deleting, verify no route or component still imports it.

Implementation steps:

1. Search imports:

```txt
InputContainer
```

2. If only the file itself references `InputContainer`, delete `components/input-container.tsx`.

3. If another page still imports it, migrate that page to `ChatComposer` or `ChatShell`.

4. Run typecheck after deletion.

Acceptance criteria:

- No stale composer implementation remains.
- No dead speech callback remains.
- Chat input behavior has one source of truth.

### Step 7: Add Unit And Component Tests

Problem:

- The behavior is currently manual-verification-only.
- Scroll and keyboard behavior regress easily without focused tests.

Industry-standard approach:

- Test pure utilities with unit tests.
- Test state derivation hooks with small deterministic cases.
- Test composer behavior through component or hook tests.
- Keep browser-layout-specific scroll behavior covered by Playwright, not only jsdom.

Recommended test files:

```txt
components/chat/utils/chat-scroll.test.ts
components/chat/hooks/use-chat-visible-status.test.ts
components/chat/hooks/use-chat-composer.test.tsx
components/chat/chat-scroll-button.test.tsx
e2e/chat-scroll.spec.ts
```

Unit test cases for `chat-scroll.ts`:

- `getDistanceFromBottom` returns `scrollHeight - scrollTop - clientHeight`.
- `isWithinBottomThreshold` returns true at threshold boundary.
- `restoreScrollAnchor` preserves viewport position after height increase.

Unit test cases for `useChatVisibleStatus`:

- Returns `error` when error exists.
- Returns `tool-running` for dynamic tool part before output is available.
- Returns `submitted` for submitted status.
- Returns `streaming` for streaming status.
- Returns `idle` when no active state exists.

Composer behavior test cases:

- Empty input disables submit.
- Busy state disables submit.
- Submit trims input.
- Submit sends `threadId` and `selectedModel` in request body.
- `Shift+Enter` does not submit.
- `Cmd/Ctrl+Enter` submits.
- Speech transcription fills empty input.
- Speech transcription appends to non-empty input.

Playwright scenarios:

- Long conversation can scroll up and stay up while mocked streaming continues.
- New user submission scrolls to bottom instantly.
- Scroll-to-bottom button appears when user leaves bottom and disappears after click.
- Mobile viewport with keyboard open does not hide the last assistant message or composer.

Acceptance criteria:

- Tests cover the highest-risk UX behavior.
- Scroll math is protected by deterministic unit tests.
- Keyboard submit behavior is protected against regressions.
- At least one end-to-end test validates real browser scrolling.

### Step 8: Manual QA Matrix

Run manual QA after the above fixes, before considering Point 1 complete.

Desktop browsers:

- Chrome latest.
- Safari latest.
- Firefox latest if supported by the project.

Mobile browsers/devices:

- iOS Safari.
- Android Chrome.
- Responsive device emulation as a fallback, but not as a replacement for at least one real mobile browser check.

Scenarios:

- New empty chat starter card populates composer.
- New empty chat submit navigates to `/chat/[threadId]`.
- Existing thread hydrates without visual flicker.
- Long thread starts at a sensible position.
- User scrolls up during streaming and is not forced to bottom.
- User clicks scroll-to-bottom and resumes latest-message anchoring.
- Multiline composer grows without covering final message.
- Mobile keyboard opens without hiding composer or final message.
- Error state appears and retry works.
- Tool-running state appears while a tool call is pending.
- Reduced motion disables smooth scroll animation.

Completion evidence to record:

- Browser/device tested.
- Scenario pass/fail.
- Bugs found.
- Follow-up issue or fix commit for each failure.

## Suggested Final File Map After Implementation

```txt
components/chat-interface.tsx
components/chat/
  chat-shell.tsx
  chat-empty-state.tsx
  chat-message-list.tsx
  chat-scroll-button.tsx
  chat-status-bar.tsx
  chat-composer.tsx
  prompt-starter-card.tsx
  aichatwave-dropdown.tsx
  hooks/
    use-chat-scroll-controller.ts
    use-chat-composer.ts
    use-chat-viewport.ts
    use-chat-visible-status.ts
  utils/
    chat-scroll.ts
    chat-status.ts
  types.ts
components/custom/message-renderer.tsx
components/ai-elements/
  conversation.tsx
  prompt-input.tsx
  message.tsx
  speech-input.tsx
```

## Implementation Order Recommendation

1. Extract `ChatShell`, `ChatMessageList`, and `ChatComposer` without changing behavior.
2. Add `useChatScrollController` and remove `ConversationAutoScroll` from the render path.
3. Stabilize composer submit, keyboard shortcuts, and speech behavior.
4. Add `useChatVisibleStatus`, `ChatStatusBar`, and tool-running labels.
5. Add prompt starter cards to the empty state.
6. Run manual desktop and mobile QA.
7. Add targeted tests for scroll utilities, status derivation, and composer behavior.
