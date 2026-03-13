/**
 * Unit tests for comic title/description builders.
 * Run via: supabase--test_edge_functions
 */

import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  buildComicTitle,
  buildComicDescription,
  buildComicMetafields,
  parsePublicationDate,
  cleanVariant,
  formatIssueNumber,
} from "./shopify-sync-core.ts";

// ── parsePublicationDate ──

Deno.test("parsePublicationDate: standard YYYY-MM", () => {
  const result = parsePublicationDate("2025-11");
  assertEquals(result, { month: "NOVEMBER", year: "2025" });
});

Deno.test("parsePublicationDate: January", () => {
  const result = parsePublicationDate("2024-01");
  assertEquals(result, { month: "JANUARY", year: "2024" });
});

Deno.test("parsePublicationDate: bare year", () => {
  const result = parsePublicationDate("2025");
  assertEquals(result, { month: "", year: "2025" });
});

Deno.test("parsePublicationDate: null/undefined/empty", () => {
  assertEquals(parsePublicationDate(null), null);
  assertEquals(parsePublicationDate(undefined), null);
  assertEquals(parsePublicationDate(""), null);
});

Deno.test("parsePublicationDate: invalid month", () => {
  assertEquals(parsePublicationDate("2025-13"), null);
  assertEquals(parsePublicationDate("2025-00"), null);
});

Deno.test("parsePublicationDate: garbage string", () => {
  assertEquals(parsePublicationDate("not-a-date"), null);
});

// ── cleanVariant ──

Deno.test("cleanVariant: strips NONE", () => {
  assertEquals(cleanVariant("NONE"), "");
  assertEquals(cleanVariant("none"), "");
  assertEquals(cleanVariant("None"), "");
});

Deno.test("cleanVariant: strips N/A and -", () => {
  assertEquals(cleanVariant("N/A"), "");
  assertEquals(cleanVariant("-"), "");
  assertEquals(cleanVariant("NA"), "");
});

Deno.test("cleanVariant: preserves real variants", () => {
  assertEquals(cleanVariant("NETEASE VARIANT"), "NETEASE VARIANT");
});

Deno.test("cleanVariant: null/undefined", () => {
  assertEquals(cleanVariant(null), "");
  assertEquals(cleanVariant(undefined), "");
});

// ── formatIssueNumber ──

Deno.test("formatIssueNumber: standard number", () => {
  assertEquals(formatIssueNumber("450"), "#450");
});

Deno.test("formatIssueNumber: already prefixed", () => {
  assertEquals(formatIssueNumber("#450"), "#450");
});

Deno.test("formatIssueNumber: null/empty", () => {
  assertEquals(formatIssueNumber(null), "");
  assertEquals(formatIssueNumber(""), "");
  assertEquals(formatIssueNumber("  "), "");
});

Deno.test("formatIssueNumber: zero-only", () => {
  assertEquals(formatIssueNumber("000"), "");
  assertEquals(formatIssueNumber("0"), "");
});

// ── buildComicTitle ──

Deno.test("buildComicTitle: standard comic with all fields", () => {
  const intakeItem = {
    catalog_snapshot: {
      brandTitle: "Marvel Comics",
      subject: "Doctor Strange",
      issueNumber: "450",
      publicationDate: "2025-11",
      varietyPedigree: "Netease Marvel Mystic Mayhem Variant",
    },
  };
  const result = buildComicTitle(intakeItem, {});
  assertEquals(
    result,
    "MARVEL COMICS DOCTOR STRANGE #450 NOVEMBER 2025 NETEASE MARVEL MYSTIC MAYHEM VARIANT"
  );
});

Deno.test("buildComicTitle: missing issue number — no dangling #", () => {
  const intakeItem = {
    catalog_snapshot: {
      brandTitle: "DC Comics",
      subject: "Batman",
      publicationDate: "2024-03",
    },
  };
  const result = buildComicTitle(intakeItem, {});
  assertEquals(result, "DC COMICS BATMAN MARCH 2024");
  assert(!result.includes("#"));
});

Deno.test("buildComicTitle: missing publisher", () => {
  const intakeItem = {
    catalog_snapshot: {
      subject: "Spider-Man",
      issueNumber: "100",
      publicationDate: "2023-06",
    },
  };
  const result = buildComicTitle(intakeItem, {});
  assertEquals(result, "SPIDER-MAN #100 JUNE 2023");
});

Deno.test("buildComicTitle: missing publication date", () => {
  const intakeItem = {
    catalog_snapshot: {
      brandTitle: "Image Comics",
      subject: "Spawn",
      issueNumber: "350",
    },
  };
  const result = buildComicTitle(intakeItem, {});
  assertEquals(result, "IMAGE COMICS SPAWN #350");
});

Deno.test("buildComicTitle: variant starting with NONE is stripped", () => {
  const intakeItem = {
    catalog_snapshot: {
      brandTitle: "Marvel",
      subject: "X-Men",
      issueNumber: "1",
      varietyPedigree: "NONE",
    },
  };
  const result = buildComicTitle(intakeItem, {});
  assert(!result.includes("NONE"));
});

Deno.test("buildComicTitle: deduplicate words", () => {
  const intakeItem = {
    catalog_snapshot: {
      brandTitle: "Marvel",
      subject: "Marvel Spider-Man",
      issueNumber: "5",
    },
  };
  const result = buildComicTitle(intakeItem, {});
  // "Marvel" should appear only once
  const count = (result.match(/MARVEL/g) || []).length;
  assertEquals(count, 1);
});

Deno.test("buildComicTitle: bare year fallback", () => {
  const intakeItem = {
    catalog_snapshot: {
      brandTitle: "DC",
      subject: "Superman",
      year: "2020",
    },
  };
  const result = buildComicTitle(intakeItem, {});
  assertEquals(result, "DC SUPERMAN 2020");
});

Deno.test("buildComicTitle: completely empty — returns fallback", () => {
  const result = buildComicTitle({}, {});
  assertEquals(result, "GRADED COMIC");
});

// ── buildComicDescription ──

Deno.test("buildComicDescription: includes labeled fields", () => {
  const intakeItem = {
    catalog_snapshot: {
      brandTitle: "Marvel",
      subject: "Avengers",
      issueNumber: "50",
      publicationDate: "2025-01",
      language: "English",
      country: "United States",
      pageQuality: "WHITE",
      category: "Modern Age",
    },
    psa_cert: "12345678",
    grade: "9.8",
    grading_company: "PSA",
  };
  const desc = buildComicDescription(intakeItem, {});
  assert(desc.includes("Cert Number:</strong> 12345678"));
  assert(desc.includes("Grade:</strong> PSA 9.8"));
  assert(desc.includes("Publisher:</strong> Marvel"));
  assert(desc.includes("Page Quality:</strong> WHITE"));
  // English language should be skipped
  assert(!desc.includes("Language:</strong>"));
});

Deno.test("buildComicDescription: non-English language shown", () => {
  const intakeItem = {
    catalog_snapshot: { language: "Spanish" },
  };
  const desc = buildComicDescription(intakeItem, {});
  assert(desc.includes("Language:</strong> Spanish"));
});

Deno.test("buildComicDescription: missing everything — no broken HTML", () => {
  const desc = buildComicDescription({}, {});
  assert(desc.includes("Graded Comic — PSA"));
  assert(!desc.includes("undefined"));
  assert(!desc.includes("null"));
  // Should not have empty labeled rows
  assert(!desc.includes(":</strong> <br>"));
});

// ── buildComicMetafields ──

Deno.test("buildComicMetafields: populates from snapshot", () => {
  const intakeItem = {
    catalog_snapshot: {
      brandTitle: "DC Comics",
      subject: "Batman",
      issueNumber: "900",
      publicationDate: "2024-10",
      language: "English",
      pageQuality: "WHITE",
    },
  };
  const mfs = buildComicMetafields(intakeItem, {});
  const keys = mfs.map((m) => m.key);
  assert(keys.includes("publisher"));
  assert(keys.includes("comic_title"));
  assert(keys.includes("issue_number"));
  assert(keys.includes("publication_date"));
  assert(keys.includes("page_quality"));
  // All should be in acs.comic namespace
  assert(mfs.every((m) => m.namespace === "acs.comic"));
});

Deno.test("buildComicMetafields: skips empty values", () => {
  const mfs = buildComicMetafields({}, {});
  assertEquals(mfs.length, 0);
});
