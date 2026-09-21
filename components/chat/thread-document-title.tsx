"use client";

import { useEffect } from "react";
import { useCachedThreadTitle } from "@/components/chat/hooks/use-cached-thread";
import { documentTitle } from "@/lib/seo/site";

/**
 * Puts the conversation's title in the browser tab.
 *
 * Not for search engines — everything under `/app` is `noindex` — but for the
 * person with nine tabs open, for whom "Conversation · AIChatWave" nine times
 * is the same as no title at all.
 *
 * This was `generateMetadata`, and moving it is a Phase L change rather than a
 * cosmetic one. Reading the thread from the database to render a tab title is
 * what made the whole route dynamic: the segment could not be prefetched in
 * full, so every thread switch waited on a server render for a string the
 * sidebar was already displaying. Reading it from the cache instead makes the
 * title appear in the same frame as the transcript, and keeps it correct with
 * the network off.
 *
 * The fallback is the segment's static metadata, which is already in the
 * document — so a thread the sidebar has not loaded shows "Conversation"
 * rather than a flash of nothing.
 */
export function ThreadDocumentTitle({ threadId }: { threadId: string }) {
  const title = useCachedThreadTitle(threadId);

  useEffect(() => {
    if (title === null || title.length === 0) return;
    document.title = documentTitle(title);
  }, [title]);

  return null;
}
