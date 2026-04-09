"use server";

import { auth, polarClient } from "@/lib/auth";
import { headers } from "next/headers";

type IngestData = {
  userId: string | undefined;
  model: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
};

export async function isCustomerHaveSubscription(userId: string) {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session) {
      throw new Error("User not logged in");
    }

    const subscription = await polarClient.subscriptions.list({
      externalCustomerId: session.user.id,
      active: true,
    });

    if (subscription.result.items.length > 0) {
      return true;
    } else {
      return false;
    }
  } catch (error) {
    console.error("Error checking subscription", error);
    return false;
  }
}
export async function getCustomerMeters(userId: string) {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    throw new Error("User not logged in");
  }

  const meters = await polarClient.customerMeters.list({
    externalCustomerId: session.user.id,
  });

  const first = meters.result.items[0];
  return first ?? null;
}

export async function ingestEventToPolar(data: IngestData) {
  const externalCustomerId = data.userId?.trim();
  if (!externalCustomerId) return;

  const metadata: Record<string, string | number> = {
    model: data.model,
    input_tokens: data.inputTokens,
    output_tokens: data.outputTokens,
    total_tokens: data.totalTokens,
  };

  await polarClient.events.ingest({
    events: [
      {
        name: "llm_tokens",
        externalCustomerId,
        metadata,
      },
    ],
  });
}
