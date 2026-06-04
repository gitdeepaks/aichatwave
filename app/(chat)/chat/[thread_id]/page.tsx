import { agent } from "@/app/api/chat/graph";
import { ChatInterfaceNew } from "@/components/chat-interface";
import { auth } from "@/lib/auth";
import { getConversationHistory } from "@/lib/conversation";
import { headers } from "next/headers";
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

  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    redirect("/auth/signin");
  }

  const userId = session.session?.userId;
  if (!userId) {
    redirect("/auth/signin");
  }

  //todo: check the ownership

  // this will run on the server side
  const conversationHistory = await getConversationHistory({
    graph: agent,
    threadId,
    userId,
  });

  return (
    <>
      <ChatInterfaceNew oldMessages={conversationHistory} />
    </>
  );
}
