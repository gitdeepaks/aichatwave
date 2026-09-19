import { db, closeDatabase } from "@/db";
import { sql } from "drizzle-orm";

const THREADS = ["18fc8451-814e-481e-bba5-6321719c44db", "fb2ad388-5899-43ab-bd94-db1fdbde1af7"];

async function main(): Promise<void> {
  const streams = await db.execute(sql`
    select thread_id, state, length(user_text) as user_text_len,
           first_token_at is not null as had_first_token,
           settled_at is not null as settled,
           (select count(*) from chat_stream_chunk c where c.stream_id = s.id) as chunks
    from chat_stream s
    where thread_id in (${THREADS[0]}, ${THREADS[1]})
    order by created_at
  `);
  const messages = await db.execute(sql`
    select thread_id, role, length(parts::text) as parts_len
    from message where thread_id in (${THREADS[0]}, ${THREADS[1]})
  `);
  console.info("streams:", JSON.stringify(streams.rows, null, 2));
  console.info("messages:", JSON.stringify(messages.rows, null, 2));
  await closeDatabase();
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
