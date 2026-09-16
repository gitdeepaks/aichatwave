import { ChatInterfaceNew } from "@/components/chat-interface";
import { getSessionUserId } from "@/server/auth/session";
import { toMessageDto } from "@/server/api/dto";
import { readThreadWindow } from "@/server/chat/thread-service";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { ChatLoadingSkeleton } from "@/components/chat/chat-loading-skeleton";

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
    redirect("/sign-in");
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
