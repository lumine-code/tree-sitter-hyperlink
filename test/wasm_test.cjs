const { before } = require("node:test");
const path = require("node:path");
const { Parser, Language } = require("web-tree-sitter");
let language;

before(async () => {
  await Parser.init();
  language = await Language.load(
    path.join(__dirname, "../tree-sitter-hyperlink.wasm"),
  );
});

require("./suite.cjs")(() => {
  const parser = new Parser();
  parser.setLanguage(language);
  return parser;
});
