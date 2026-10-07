const assert = require("node:assert/strict");
const { test } = require("node:test");
const {
  edit,
  snapshot,
  parserFor,
  parse,
  logCounts,
  ranges,
} = require("./helpers.cjs");

module.exports = function registerTests(create) {
  test("keeps URL ranges and prose delimiters", (t) => {
    const parser = parserFor(t, create);
    for (const [source, expected] of [
      [
        "(see https://en.wikipedia.org/wiki/Foo_(bar))",
        ["https://en.wikipedia.org/wiki/Foo_(bar)"],
      ],
      [
        "**[site](https://example.com/path?q=1)**",
        ["https://example.com/path?q=1"],
      ],
      ["https://example.com/a(b(c)d)e", ["https://example.com/a(b(c)d)e"]],
      ["https://example.com/a(b", ["https://example.com/a"]],
      ["https://example.com/a(b(c)d", ["https://example.com/a"]],
      ["https://example.com/a(b)c(d", ["https://example.com/a(b)c"]],
      ["https://example.com/a(b text) after", ["https://example.com/a"]],
      [
        "https://example.com)x https://example.org",
        ["https://example.com", "https://example.org"],
      ],
      ["https://example.com]**", ["https://example.com"]],
      ["https://example.com/foo_", ["https://example.com/foo"]],
      [
        "https://api.example.com/search?q=*",
        ["https://api.example.com/search?q="],
      ],
      ["https://host_", ["https://host"]],
      ["http: https:// http://?what", []],
      ["", []],
    ]) {
      const tree = parse(t, parser, source);
      assert.deepEqual(
        tree.rootNode.descendantsOfType("url").map((node) => node.text),
        expected,
        source,
      );
    }
  });

  test("preserves punctuation within complete queries and paths", (t) => {
    const parser = parserFor(t, create);
    for (const url of [
      "https://example.com/path?q=1",
      "https://example.com/?a=b&c=d#section",
      "https://example.com/?filter[name]=x",
      "https://example.com/a?b=a?b=end",
      "https://example.com/foo?first=1;second=2",
      "https://example.com/a[b]c",
      "https://user:pass@example.com:8080/path",
      "https://example.com/a*b/c",
      "https://example.com/~user",
    ]) {
      const tree = parse(t, parser, `before ${url}. after`);
      assert.deepEqual(
        tree.rootNode.descendantsOfType("url").map((node) => node.text),
        [url],
      );
    }
  });

  test("does not confuse NUL characters with EOF", (t) => {
    const parser = parserFor(t, create);
    const tree = parse(
      t,
      parser,
      "\0 hhttps://example.com/a\0https://example.org/end\0",
    );
    assert.deepEqual(
      tree.rootNode.descendantsOfType("url").map((node) => node.text),
      ["https://example.com/a", "https://example.org/end"],
    );
  });

  test("does not join URLs or prefixes across disjoint included ranges", (t) => {
    const parser = parserFor(t, create);
    const source = "https://example.com/a(b ignored )end https://example.org";
    const tree = parse(t, parser, source, null, {
      includedRanges: ranges(source, [
        "https://example.com/a(b",
        ")end https://example.org",
      ]),
    });
    assert.deepEqual(
      tree.rootNode.descendantsOfType("url").map((node) => node.text),
      ["https://example.com/a", "https://example.org"],
    );
    const fragment = "htt ignored ps://example.com";
    const fragmented = parse(t, parser, fragment, null, {
      includedRanges: ranges(fragment, ["htt", "ps://example.com"]),
    });
    assert.equal(fragmented.rootNode.descendantsOfType("url").length, 0);
  });

  test("batches punctuation and overlapping failed prefixes with bounded parser work", (t) => {
    const parser = parserFor(t, create);
    for (const pattern of [
      "h",
      ",",
      "ht",
      "http",
      "https",
      "http:/",
      "http://?",
    ]) {
      const text = pattern.repeat(8192);
      const counts = logCounts(parser, "_text");
      const tree = parse(t, parser, `${text} https://example.com`);
      parser.setLogger(null);
      assert.deepEqual(
        tree.rootNode.descendantsOfType("url").map((node) => node.text),
        ["https://example.com"],
      );
      assert.ok(
        counts.text > 0 && counts.text < text.length / 1024 + 8,
        JSON.stringify(counts),
      );
      assert.ok(counts.steps < text.length / 256 + 64, JSON.stringify(counts));
    }
  });

  test("recognizes URL prefixes around text chunk boundaries", (t) => {
    const parser = parserFor(t, create);
    for (let length = 4088; length <= 4104; length++) {
      const tree = parse(
        t,
        parser,
        `${"h".repeat(length)}https://example.com/path`,
      );
      assert.deepEqual(
        tree.rootNode.descendantsOfType("url").map((node) => node.text),
        ["https://example.com/path"],
      );
    }
  });

  test("handles deeply balanced and incomplete parentheses without parser recursion", (t) => {
    const parser = parserFor(t, create);
    const url = `https://example.com/${"(".repeat(20000)}a${")".repeat(20000)}`;
    const tree = parse(t, parser, url);
    assert.deepEqual(
      tree.rootNode.descendantsOfType("url").map((node) => node.text),
      [url],
    );
    const incomplete = parse(t, parser, url.slice(0, -1));
    assert.deepEqual(
      incomplete.rootNode.descendantsOfType("url").map((node) => node.text),
      ["https://example.com/"],
    );
  });

  test("reuses text chunks after an edit in a long paragraph", (t) => {
    const parser = parserFor(t, create);
    let source = `${"ordinary words ".repeat(5000)} https://example.com`;
    let tree = parse(t, parser, source);
    source = edit(tree, source, 30000, 1, "O");
    const counts = logCounts(parser, "_text");
    tree = parse(t, parser, source, tree);
    parser.setLogger(null);
    assert.ok(counts.consumed < 16384, JSON.stringify(counts));
    assert.ok(counts.steps < 128, JSON.stringify(counts));
    assert.deepEqual(
      snapshot(tree, ["url"]),
      snapshot(parse(t, parser, source), ["url"]),
    );
  });

  test("matches fresh parsing after edits to prefixes, delimiters, NUL and Unicode", (t) => {
    const parser = parserFor(t, create);
    let seed = 4771;
    const random = (n) => {
      seed = (1664525 * seed + 1013904223) >>> 0;
      return seed % n;
    };
    const pieces = [
      "h",
      "http://",
      "https://example.com/a(b)c",
      "https://example.com/a(b",
      " ) ",
      "***",
      "\n",
      "\0",
      "ą",
      "🐱",
      " ordinary ",
    ];
    let source = pieces.join(" ");
    let tree = parse(t, parser, source);
    for (let index = 0; index < 400; index++) {
      const offset = random(source.length + 1);
      const deleted = Math.min(random(8), source.length - offset);
      source = edit(
        tree,
        source,
        offset,
        deleted,
        pieces[random(pieces.length)],
      );
      tree = parse(t, parser, source, tree);
      assert.deepEqual(
        snapshot(tree, ["url"]),
        snapshot(parse(t, parser, source), ["url"]),
      );
    }
  });
};
