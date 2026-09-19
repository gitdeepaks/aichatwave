import type { Metadata } from "next";
import { ChatInterfaceNew } from "@/components/chat-interface";
import { getSessionUserId } from "@/server/auth/session";
import { toMessageDto } from "@/server/api/dto";
import { readThreadWindow } from "@/server/chat/thread-service";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { ChatLoadingSkeleton } from "@/components/chat/chat-loading-skeleton";
import { ROUTES } from "@/lib/routes";
import { requireOwnedThread } from "@/server/chat/thread-service";

/**
 * The browser tab carries the conversation's own title.
 *
 * Not for search engines — everything under `/app` is `noindex` — but for the
 * person with nine tabs open, for whom "Workspace · AIChatWave" nine times is
 * the same as no title at all.
 *
 * Failures fall back to the segment default rather than propagating. A thread
 * that is missing or not yours is the page's problem to report, with a 404 and
 * a redirect; a thrown `generateMetadata` would turn that into an error
 * boundary and lose the distinction.
 */
export async function generateMetadata({
  params,
}: Readonly<{
  params: Promise<{ [key: string]: string | string[] | undefined }>;
}>): Promise<Metadata> {
  const { thread_id } = await params;
  const userId = await getSessionUserId();
  if (typeof thread_id !== "string" || userId === null) return {};

  try {
    const thread = await requireOwnedThread({ threadId: thread_id, userId });
    return { title: thread.title };
  } catch {
    return {};
  }
}

export default async function Page({
  params,
}: Readonly<{
  children: React.ReactNode;
  params: Promise<{ [key: string]: string | string[] | undefined }>;
}>) {
  const { thread_id } = await params;
  const threadId = typeof thread_id === "string" && thread_id.length > 0 ? thread_id : undefined;

  if (!threadId) {
    notFound();
  }

  return (
    <Suspense fallback={<ChatLoadingSkeleton />}>
      <Conversation threadId={threadId} />
    </Suspense>
  );
}

async function Conversation({ threadId }: Readonly<{ threadId: string }>) {
  const userId = await getSessionUserId();
  if (!userId) {
    redirect(ROUTES.signIn);
  }

  const page = await readThreadWindow({ userId, threadId, limit: 50 });

  return (
    <ChatInterfaceNew
      threadId={threadId}
      initialMessages={page.items.map(toMessageDto)}
      initialNextCursor={page.nextCursor}
    />
  );
}
