const assert = require("node:assert");
const { test } = require("node:test");
const hyperlink = require(".");

test("loads the grammar through the Node-API binding", () => {
  assert.strictEqual(hyperlink.name, "hyperlink");
  assert.ok(hyperlink.language);
  assert.ok(Array.isArray(hyperlink.nodeTypeInfo));
});
