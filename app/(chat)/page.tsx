import { randomUUID } from "node:crypto";
import { ChatInterfaceNew } from "@/components/chat-interface";

/**
 * Not cached: every visit needs its own thread id.
 *
 * The id is minted here, on the server, rather than in the composer. It is what
 * keys the per-thread chat instance, so generating it later — or generating it
 * once per module, as the store used to — would let two conversations started
 * in one session share an instance and a resume endpoint.
 */
export const dynamic = "force-dynamic";

export default function HomePage() {
  return <ChatInterfaceNew threadId={randomUUID()} initialMessages={[]} initialNextCursor={null} />;
}
