module.exports = grammar({
  name: "hyperlink",

  extras: () => [],

  externals: ($) => [$.url, $._text],

  rules: {
    prose: ($) => repeat(choice($.url, $._text)),
  },
});
