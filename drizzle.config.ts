import { defineConfig } from "drizzle-kit";
import { env } from "./lib/env";

export default defineConfig({
  out: "./drizzle",
  schema: "./db/schema",
  dialect: "postgresql",
  dbCredentials: {
    url: env.DATABASE_URL,
  },
});
