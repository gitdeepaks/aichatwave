"use server";

import { db } from "@/db";
import { thread } from "@/db/schema/chat-schema";
import { auth } from "@/lib/auth";
import { desc, eq } from "drizzle-orm";
import { headers } from "next/headers";

export const getThreads = async () => {
  // for perticular userID
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.session?.userId) {
    return [];
  }
  const threads = await db
    .select({ id: thread.id, title: thread.title, createdAt: thread.createdAt })
    .from(thread)
    .where(eq(thread.userId, session.session.userId))
    .orderBy(desc(thread.createdAt));

  return threads;
};
