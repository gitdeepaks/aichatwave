/**
 * The Phase C contract, locked: a tool result survives every shape the
 * transport can deliver it in, and comes back out identical.
 *
 * A tool payload crosses more boundaries than is obvious, and each one may
 * hand the next either an object or its JSON text:
 *
 *   tool return value
 *     → LangChain `ToolMessage` content (a string)
 *     → checkpoint (that string, possibly still inside its `kwargs` envelope)
 *     → `message.parts` as a persisted `tool` part
 *     → `convertMessageDtoToUI` → the AI SDK's `dynamic-tool` part
 *     → `parseToolResult` → the card's props
 *
 * `tests/tool-contracts.test.ts` checks that each schema round-trips its own
 * value. This checks the part that actually broke before the contract existed:
 * the same value arriving in four different envelopes, under two spellings of
 * the tool name, through the real persisted-part schema and the real converter.
 *
 * The final test is a gate — a tool added to `TOOL_NAMES` without a sample here
 * fails, rather than shipping a renderer path nobody exercised.
 */

import assert from "node:assert/strict";
import test from "node:test";
import { messagePartsSchema, type MessageParts } from "@/lib/ai/message-parts";
import { parseJsonText } from "@/lib/json";
import { convertMessageDtoToUI } from "@/lib/converters";
import { messageDtoSchema } from "@/lib/api/contracts";
import {
  parseToolName,
  parseToolResult,
  TOOL_NAMES,
  type DisplayNewsResult,
  type DisplayProductsResult,
  type DisplayWeatherResult,
  type ToolName,
} from "@/lib/ai/tool-contracts";

const products: DisplayProductsResult = {
  query: "mechanical keyboard",
  products: [
    {
      id: "p1",
      title: "Keyboard 61",
      description: "Example Store",
      price: 129.5,
      rating: 4.4,
      thumbnail: "https://example.test/p1.jpg",
      productLink: "https://example.test/p1",
    },
  ],
};

const weather: DisplayWeatherResult = {
  location: "Reykjavík, Iceland",
  temperature: 3,
  feelsLike: -1,
  humidity: 81,
  windSpeed: 24,
  isDay: false,
  weatherCode: 61,
  hourly: [{ time: "9 PM", temperature: 3, weatherCode: 61 }],
  daily: [{ day: "Tue", min: 1, max: 5, weatherCode: 61 }],
};

const news: DisplayNewsResult = {
  query: "NVDA",
  news: [
    {
      uuid: "n1",
      title: "Something happened",
      publisher: "Example Wire",
      link: "https://example.test/n1",
      publishTime: "1/2/2026, 8:00:00 AM",
      thumbnail: null,
    },
  ],
  summary: "One headline.",
};

/**
 * One sample per tool. `satisfies` is what makes a missing entry a compile
 * error rather than something the gate below has to catch at runtime — the
 * gate is the backstop for the case where this file is edited to hush it.
 */
const SAMPLES = {
  display_products: products,
  display_weather: weather,
  display_news: news,
} satisfies Record<ToolName, unknown>;

/**
 * The envelopes a payload can arrive in, named after where each comes from.
 * `parseToolResult` is the one place any of them is unwrapped.
 */
const ENVELOPES: { name: string; wrap: (result: unknown) => unknown }[] = [
  { name: "the object the tool returned", wrap: (result) => result },
  { name: "JSON text, as a ToolMessage carries it", wrap: (result) => JSON.stringify(result) },
  {
    name: "a LangChain envelope around the object",
    wrap: (result) => ({ kwargs: { content: result } }),
  },
  {
    name: "a LangChain envelope around JSON text, as a checkpoint stores it",
    wrap: (result) => ({ kwargs: { content: JSON.stringify(result) } }),
  },
];

/** The two spellings a provider may report a dynamic tool under. */
const SPELLINGS = (name: ToolName): string[] => [name, name.replaceAll("_", "-")];

for (const [toolName, sample] of Object.entries(SAMPLES)) {
  for (const envelope of ENVELOPES) {
    for (const spelling of SPELLINGS(parseToolNameOrThrow(toolName))) {
      test(`${toolName} survives ${envelope.name} as "${spelling}"`, () => {
        const parsed = parseToolResult(spelling, envelope.wrap(sample));

        assert.notEqual(parsed, null, "the renderer would have shown nothing");
        assert.equal(parsed?.toolName, toolName);
        assert.deepEqual(parsed?.result, sample);
      });
    }
  }

  test(`${toolName} survives being persisted and read back as a message part`, () => {
    // What the turn recorder writes, and what the history endpoint reads.
    // Round-tripped through JSON first, because `parts` is a `jsonb` column and
    // whatever the tool returned has already been through a serializer twice by
    // the time it lands there.
    const stored: MessageParts = [
      {
        type: "tool",
        toolCallId: "call_1",
        toolName,
        state: "output-available",
        input: { query: "anything" },
        output: parseJsonText(JSON.stringify(sample)),
        errorText: null,
      },
    ];

    const reloaded = messagePartsSchema.parse(parseJsonText(JSON.stringify(stored)));

    const dto = messageDtoSchema.parse({
      id: "m1",
      threadId: "t1",
      role: "assistant",
      parts: reloaded,
      modelId: "gpt-5-nano",
      inputTokens: 10,
      outputTokens: 20,
      createdAt: new Date("2026-01-01T00:00:00.000Z").toISOString(),
    });

    const [uiPart] = convertMessageDtoToUI(dto).parts;
    assert.equal(uiPart?.type, "dynamic-tool");

    // The renderer's own call, on exactly what the converter produced.
    const output = uiPart?.type === "dynamic-tool" ? uiPart.output : null;
    const parsed = parseToolResult(toolName, output);

    assert.deepEqual(parsed?.result, sample);
  });
}

test("a tool this app does not own is not rendered as one that it does", () => {
  assert.equal(parseToolResult("some_other_tool", products), null);
  assert.equal(parseToolName("some_other_tool"), null);
});

test("a payload that does not match its contract is refused, not half-rendered", () => {
  // A renamed field is the failure this contract exists to make loud. Before
  // it, the card rendered with `0` in place of every price.
  const renamed = { query: "x", products: [{ ...products.products[0], price: undefined }] };

  assert.equal(parseToolResult("display_products", renamed), null);
  assert.equal(parseToolResult("display_weather", { location: "Nowhere" }), null);
});

test("every tool in TOOL_NAMES is covered above", () => {
  assert.deepEqual([...TOOL_NAMES].sort(), Object.keys(SAMPLES).sort());
});

function parseToolNameOrThrow(value: string): ToolName {
  const name = parseToolName(value);
  if (name === null) throw new Error(`${value} is not a tool name`);
  return name;
}
