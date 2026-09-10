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

  const tree = parser.parse(`${"x".repeat(4096)} https://example.com`);

  assert.strictEqual(tree.rootNode.descendantsOfType("url").length, 1);
  assert.ok(proseTokenCount < 10, `lexed ${proseTokenCount} ordinary-prose tokens`);
});
