const assert = require("node:assert/strict");

function point(source, index) {
  const lines = source.slice(0, index).split("\n");
  return { row: lines.length - 1, column: lines.at(-1).length };
}

function edit(tree, source, index, deleted, inserted) {
  const after =
    source.slice(0, index) + inserted + source.slice(index + deleted);
  tree.edit({
    startIndex: index,
    oldEndIndex: index + deleted,
    newEndIndex: index + inserted.length,
    startPosition: point(source, index),
    oldEndPosition: point(source, index + deleted),
    newEndPosition: point(after, index + inserted.length),
  });
  return after;
}

function snapshot(tree, types) {
  return {
    error: tree.rootNode.hasError,
    tree: tree.rootNode.toString(),
    nodes: types.flatMap((type) =>
      tree.rootNode
        .descendantsOfType(type)
        .map((node) => [
          type,
          node.startIndex,
          node.endIndex,
          node.text,
          node.startPosition.row,
          node.startPosition.column,
          node.endPosition.row,
          node.endPosition.column,
        ]),
    ),
  };
}

function parserFor(test, create) {
  const parser = create();
  test.after(() => parser.delete?.());
  return parser;
}

function parse(test, parser, source, oldTree = null, options) {
  const tree = parser.parse(source, oldTree, options);
  assert.ok(tree);
  assert.equal(tree.rootNode.hasError, false, tree.rootNode.toString());
  test.after(() => tree.delete?.());
  return tree;
}

function logCounts(parser, textType) {
  const counts = { text: 0, steps: 0, consumed: 0 };
  parser.setLogger((message, parameters) => {
    if (
      message === "lexed_lookahead" ||
      message.startsWith("lexed_lookahead ")
    ) {
      const symbol = parameters?.sym ?? message.match(/sym:([^, ]+)/)?.[1];
      if (symbol === textType) counts.text++;
    }
    if (message === "process" || message.startsWith("process ")) counts.steps++;
    if (message === "consume" || message.startsWith("consume "))
      counts.consumed++;
  });
  return counts;
}

function ranges(source, parts) {
  let offset = 0;
  return parts.map((part) => {
    const startIndex = source.indexOf(part, offset);
    assert.ok(startIndex >= 0);
    const endIndex = startIndex + part.length;
    offset = endIndex;
    return {
      startIndex,
      endIndex,
      startPosition: point(source, startIndex),
      endPosition: point(source, endIndex),
    };
  });
}

module.exports = { edit, snapshot, parserFor, parse, logCounts, ranges };
