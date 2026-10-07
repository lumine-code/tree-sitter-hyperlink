const assert = require("node:assert/strict");
const { test } = require("node:test");
const Parser = require("tree-sitter");
const hyperlink = require(".");

test("loads the grammar through the Node-API binding", () => {
  assert.equal(hyperlink.name, "hyperlink");
  assert.ok(hyperlink.language);
  assert.ok(Array.isArray(hyperlink.nodeTypeInfo));
});

require("../../test/suite.cjs")(() => {
  const parser = new Parser();
  parser.setLanguage(hyperlink);
  return parser;
});
