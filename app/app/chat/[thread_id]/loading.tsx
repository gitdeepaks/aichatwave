import { ChatLoadingSkeleton } from "@/components/chat/chat-loading-skeleton";

/**
 * Declared explicitly rather than inheriting the segment fallback: opening a
 * thread awaits its full history server-side, so this is the one route where
 * the fallback is reliably visible.
 */
export default function Loading() {
  return <ChatLoadingSkeleton />;
}
