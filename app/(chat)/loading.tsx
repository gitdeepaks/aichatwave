import { ChatLoadingSkeleton } from "@/components/chat/chat-loading-skeleton";

/**
 * Fallback for the `(chat)` segment and any nested route without its own.
 * The layout above it — sidebar, header, model selector — stays mounted.
 */
export default function Loading() {
  return <ChatLoadingSkeleton />;
}
