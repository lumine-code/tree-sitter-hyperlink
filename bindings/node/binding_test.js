const assert = require("node:assert");
const { test } = require("node:test");
const Parser = require("tree-sitter");
const hyperlink = require(".");

test("loads the grammar through the Node-API binding", () => {
  assert.strictEqual(hyperlink.name, "hyperlink");
  assert.ok(hyperlink.language);
  assert.ok(Array.isArray(hyperlink.nodeTypeInfo));
});

test("batches ordinary prose while preserving embedded URLs", () => {
  const parser = new Parser();
  parser.setLanguage(hyperlink);

  let proseTokenCount = 0;
  parser.setLogger((message, parameters) => {
    if (message === "lexed_lookahead" && parameters.sym === "_non_url_text") {
      proseTokenCount++;
    }
  });

  const tree = parser.parse(`${"the quick brown fox ".repeat(256)}https://example.com`);

  assert.strictEqual(tree.rootNode.descendantsOfType("url").length, 1);
  assert.ok(proseTokenCount < 10, `lexed ${proseTokenCount} ordinary-prose tokens`);
});

test("does not let a batched prose token truncate a paired URL suffix", () => {
  const parser = new Parser();
  parser.setLanguage(hyperlink);

  const source = "(see https://en.wikipedia.org/wiki/Foo_(bar))";
  const tree = parser.parse(source);
  const urls = tree.rootNode.descendantsOfType("url");

  assert.strictEqual(urls.length, 1);
  assert.strictEqual(urls[0].text, "https://en.wikipedia.org/wiki/Foo_(bar)");
});
