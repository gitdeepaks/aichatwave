import { ChatInterfaceNew } from "@/components/chat-interface";
import { getSessionUserId } from "@/server/auth/session";
import { getThreadHistory } from "@/server/chat/chat-service";
import { notFound, redirect } from "next/navigation";

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

  const userId = await getSessionUserId();
  if (!userId) {
    redirect("/sign-in");
  }

  const conversationHistory = await getThreadHistory({ userId, threadId });

  return <ChatInterfaceNew oldMessages={conversationHistory} />;
}
