import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const load = async (path) => JSON.parse(await readFile(new URL(path, import.meta.url), "utf8"));
const source = await load("../data/sira-sizde.json");
const published = await load("../dist/sira-sizde.json");

test("all first-five-unit Sıra Sizde prompts and book answers are published unchanged", () => {
  assert.deepEqual(published, source);
  assert.equal(published.questions.length, 16);
  assert.deepEqual([1, 2, 3, 4, 5].map((unit) => published.questions.filter((q) => q.unit === unit).length), [4, 5, 3, 1, 3]);
  assert.equal(new Set(published.questions.map((q) => q.id)).size, 16);
  for (const q of published.questions) {
    assert.equal(q.type, "sira-sizde");
    assert.ok(q.prompt?.trim(), q.id + " prompt missing");
    assert.ok(q.answer?.trim(), q.id + " book answer missing");
    assert.ok(q.explanation?.trim(), q.id + " explanation missing");
    assert.ok(Number.isInteger(q.source?.pdfPage) && q.source.pdfPage > 0, q.id + " prompt source missing");
    assert.ok(Number.isInteger(q.answerSource?.pdfPage) && q.answerSource.pdfPage > 0, q.id + " answer source missing");
  }
});

test("book question-answer mismatches remain explicitly marked", () => {
  const marked = published.questions.filter((q) => q.ambiguityNote).map((q) => q.id);
  assert.deepEqual(marked, ["u1-sira-sizde-1", "u1-sira-sizde-3", "u2-sira-sizde-4"]);
});
