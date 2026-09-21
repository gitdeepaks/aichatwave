import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ChatInterfaceNew } from "@/components/chat-interface";
import { ThreadDocumentTitle } from "@/components/chat/thread-document-title";

/**
 * The segment default. The conversation's own title is set on the client.
 *
 * This used to read the thread from the database so the browser tab could
 * carry its title. That read is what made the route a dynamic page with a
 * server round trip on every switch — for a string the client already has in
 * its cache. `ThreadDocumentTitle` sets it from the same cached thread record
 * the sidebar renders, so the tab is now correct *sooner* than it was, and
 * correct offline, which the server read never managed.
 */
export const metadata: Metadata = { title: "Conversation" };

/**
 * Deliberately empty of data.
 *
 * Phase L: this page awaited a 50-message window before it rendered anything,
 * so every thread switch was a server round trip whose payload the client
 * usually already had. The transcript now comes from the persisted query cache
 * (`components/chat/hooks/use-thread-transcript.ts`), which means this segment
 * has nothing to fetch, nothing to stream, and nothing to wait for — it is a
 * thread id and a component. That is what lets `router.prefetch` on hover
 * produce a genuinely complete prefetch, and it is why there is no `Suspense`
 * boundary or `loading.tsx` here any more: neither had anything left to fall
 * back for.
 *
 * Access control did not move. `listThreadMessages` still refuses a thread
 * that belongs to someone else, so the transcript request 403s rather than
 * rendering — and it still tolerates one that does not exist yet, which is the
 * ordinary state of a conversation whose first message is in flight.
 */
export default async function Page({
  params,
}: Readonly<{
  params: Promise<{ [key: string]: string | string[] | undefined }>;
}>) {
  const { thread_id } = await params;
  const threadId = typeof thread_id === "string" && thread_id.length > 0 ? thread_id : undefined;

  if (!threadId) {
    notFound();
  }

  return (
    <>
      <ThreadDocumentTitle threadId={threadId} />
      <ChatInterfaceNew threadId={threadId} isNewThread={false} />
    </>
  );
}
