# tree-sitter-hyperlink

A Tree-sitter grammar for URLs in prose.

Meant to be injected into other grammars so that a URL sitting in a comment, a string, or a
paragraph of prose gets recognized as one. Validating the URL, or its TLD, is out of scope.

## Features

- **Grammars**: provides Tree-sitter grammars.
- **Protocols**: recognizes `http` and `https` URLs, and the fragments that lead to them.
- **Prose delimiters**: refuses to end a URL on punctuation that reads as prose, so a sentence's
  final period or a markdown emphasis marker stays out of the link.
- **Balanced parentheses**: keeps a `)` only when its `(` appeared earlier in the URL, nesting
  included, so `en.wikipedia.org/wiki/Alison_(song)` survives being wrapped in parentheses.
- **Portable scanner**: supports native and WebAssembly builds through a C external scanner.

## Installation

```sh
npm install tree-sitter @lumine-code/tree-sitter-hyperlink
```

## Usage

```js
const Parser = require("tree-sitter");
const Hyperlink = require("@lumine-code/tree-sitter-hyperlink");

const parser = new Parser();
parser.setLanguage(Hyperlink);
const tree = parser.parse("You might find my web site at https://example.com.");
```

## Where a URL ends

A URL may end on a letter, a digit, or one of `& @ \ ^ $ = - % | + # /`. Everything else is
legal inside a URL but not at the end of one, because in prose those characters are far more
likely to belong to the sentence than to the link.

That includes `* _ ~` and a backtick, which are markdown emphasis, strikethrough and code
delimiters — the same characters GFM's autolink extension excludes from the end of an autolink.
So `**[a](https://example.com)**` yields `https://example.com`, not `https://example.com)**`.
The cost is that a genuine trailing `*` or `_` is trimmed too: `?q=*` parses as `?q=`.

Parentheses are not in either set. A `(` or `)` reaches a URL only as part of a balanced pair,
so an unpaired `)` ends the URL wherever it appears.

## Building

```sh
npm install
npm test
npm run build:wasm
```

## Contributing

Got ideas to make this package better, found a bug, or want to help add new features? Just drop your thoughts on GitHub. Any feedback is welcome!
