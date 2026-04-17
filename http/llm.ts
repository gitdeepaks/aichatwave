import { z } from "zod";
import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { BaseMessage, SystemMessage } from "@langchain/core/messages";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const MemoryItemSchema = z.object({
  text: z.string().describe("Atomic user memory as a short sentence"),
  is_new: z.boolean().describe("True if this memory is NEW. False if duplicate."),
});

const MemoryDecisionSchema = z.object({
  should_write: z.boolean().describe("Whether to store any memories"),
  memories: z.array(MemoryItemSchema),
});

export type MemoryDecision = z.infer<typeof MemoryDecisionSchema>;

export async function callOpenAIModel(params: {
  usermsgs: BaseMessage[];
  sysmsg?: SystemMessage;
  structuredOutput?: boolean;
}): Promise<string | MemoryDecision | null> {
  const { usermsgs, sysmsg, structuredOutput } = params;

  const mappedUserMessages = usermsgs.map((msg) => ({
    role: "user" as const,
    content: String(msg.content ?? ""),
  }));

  const inputMessages: { role: "system" | "user"; content: string }[] = [];

  if (sysmsg) {
    inputMessages.push({
      role: "system" as const,
      content: String(sysmsg.content ?? ""),
    });
  }

  const finalInputMessages = [...inputMessages, ...mappedUserMessages];

  if (structuredOutput) {
    const response = await openai.responses.parse({
      model: "gpt-5-nano",
      input: finalInputMessages,
      text: {
        format: zodTextFormat(MemoryDecisionSchema, "memory_extractor"),
      },
    });

    return response.output_parsed ?? null;
  }

  const response = await openai.chat.completions.create({
    model: "gpt-5-nano",
    messages: finalInputMessages,
  });

  return response.choices[0]?.message?.content ?? null;
}

