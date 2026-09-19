import assert from "node:assert/strict";
import test from "node:test";

import type { JsonObject } from "@/lib/json";
import { FAQ } from "@/lib/marketing/content";
import { buildPlanCards } from "@/lib/marketing/plans";
import {
  breadcrumbJsonLd,
  faqJsonLd,
  organizationJsonLd,
  serializeJsonLd,
  softwareApplicationJsonLd,
  websiteJsonLd,
} from "@/lib/seo/json-ld";
import { ROUTES } from "@/lib/routes";

const ORIGIN = "https://www.aichatwave.in";

/** Reads a field without an assertion, so a shape change fails as a null here. */
function field(document: JsonObject, key: string): unknown {
  return document[key];
}

test("every document declares the schema.org context", () => {
  const plans = buildPlanCards({ proPrice: null });
  const documents = [
    organizationJsonLd(ORIGIN),
    websiteJsonLd(ORIGIN),
    softwareApplicationJsonLd({ origin: ORIGIN, plans }),
    faqJsonLd({ entries: FAQ }),
    breadcrumbJsonLd({ origin: ORIGIN, trail: [{ name: "Home", path: ROUTES.home }] }),
  ];

  for (const document of documents) {
    assert.equal(field(document, "@context"), "https://schema.org");
    assert.equal(typeof field(document, "@type"), "string");
  }
});

test("the website and the application point at the same organization node", () => {
  const organization = organizationJsonLd(ORIGIN);
  const website = websiteJsonLd(ORIGIN);
  const application = softwareApplicationJsonLd({
    origin: ORIGIN,
    plans: buildPlanCards({ proPrice: null }),
  });

  const id = field(organization, "@id");
  assert.equal(typeof id, "string");
  assert.deepEqual(field(website, "publisher"), { "@id": id });
  assert.deepEqual(field(application, "publisher"), { "@id": id });
});

test("URLs are absolute against the given origin", () => {
  const organization = organizationJsonLd(ORIGIN);
  assert.equal(field(organization, "url"), `${ORIGIN}/`);
  assert.equal(field(organization, "logo"), `${ORIGIN}/brand-logo.png`);
});

/**
 * The rule the module exists to enforce: no offer is published for a price the
 * billing system did not supply.
 */
test("an unreadable Pro price publishes the free offer and no other", () => {
  const application = softwareApplicationJsonLd({
    origin: ORIGIN,
    plans: buildPlanCards({ proPrice: null }),
  });

  const offers = field(application, "offers");
  assert.ok(Array.isArray(offers));
  assert.equal(offers.length, 1);
  assert.deepEqual(offers[0], {
    "@type": "Offer",
    name: "Free",
    price: "0.00",
    priceCurrency: "USD",
    url: `${ORIGIN}/pricing`,
    availability: "https://schema.org/InStock",
  });
});

test("a known Pro price publishes both offers in major units", () => {
  const application = softwareApplicationJsonLd({
    origin: ORIGIN,
    plans: buildPlanCards({
      proPrice: { amountMinor: 1999, currency: "USD", interval: "month" },
    }),
  });

  const offers = field(application, "offers");
  assert.ok(Array.isArray(offers));
  assert.equal(offers.length, 2);
  assert.deepEqual(offers[1], {
    "@type": "Offer",
    name: "Pro",
    price: "19.99",
    priceCurrency: "USD",
    url: `${ORIGIN}/pricing`,
    availability: "https://schema.org/InStock",
  });
});

test("the FAQ graph carries exactly the visible questions and answers", () => {
  const document = faqJsonLd({ entries: FAQ });
  const entities = field(document, "mainEntity");
  assert.ok(Array.isArray(entities));
  assert.equal(entities.length, FAQ.length);

  assert.deepEqual(entities[0], {
    "@type": "Question",
    name: FAQ[0]?.question,
    acceptedAnswer: { "@type": "Answer", text: FAQ[0]?.answer },
  });
});

test("breadcrumb positions are one-based and in order", () => {
  const document = breadcrumbJsonLd({
    origin: ORIGIN,
    trail: [
      { name: "Home", path: ROUTES.home },
      { name: "Pricing", path: ROUTES.pricing },
    ],
  });

  assert.deepEqual(field(document, "itemListElement"), [
    { "@type": "ListItem", position: 1, name: "Home", item: `${ORIGIN}/` },
    { "@type": "ListItem", position: 2, name: "Pricing", item: `${ORIGIN}/pricing` },
  ]);
});

/**
 * The security property of the whole module: nothing serialized into an inline
 * `<script>` may contain a literal `<`, or it can close the tag.
 */
test("serialization escapes every angle bracket", () => {
  const hostile: JsonObject = { name: "</script><script>alert(1)</script>" };
  const serialized = serializeJsonLd([hostile]);

  assert.equal(serialized.includes("<"), false);
  assert.equal(serialized.includes("\\u003c/script"), true);
  // Still valid JSON, and still the same value once parsed.
  const parsed: unknown = JSON.parse(serialized);
  assert.deepEqual(parsed, hostile);
});

test("a single document serializes as an object and several as an array", () => {
  const one = serializeJsonLd([organizationJsonLd(ORIGIN)]);
  assert.equal(one.startsWith("{"), true);

  const many = serializeJsonLd([organizationJsonLd(ORIGIN), websiteJsonLd(ORIGIN)]);
  assert.equal(many.startsWith("["), true);
});
