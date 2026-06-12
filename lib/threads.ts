"use server";

import { getSessionUserId } from "@/server/auth/session";
import { getThreadsForUser, type ThreadSummary } from "@/server/chat/chat-service";

export const getThreads = async (): Promise<ThreadSummary[]> => {
  const userId = await getSessionUserId();
  if (!userId) return [];
  return getThreadsForUser(userId);
};
