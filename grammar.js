module.exports = grammar({
  name: "hyperlink",
  extras: () => [],
  externals: ($) => [
    $._start,
    $._range_start,
    $._run,
    $._tail,
    $._open,
    $._close,
    $._text,
    $._range_text,
  ],
  // Retain an error-free prose alternative while a group is unfinished.
  conflicts: ($) => [[$.url]],
  rules: {
    prose: ($) =>
      repeat(
        choice(
          $.url,
          $._run,
          $._tail,
          $._open,
          $._close,
          $._text,
          $._range_text,
        ),
      ),
    url: ($) => seq(choice($._start, $._range_start), repeat($._part)),
    // A complete continuation wins over ending the URL before its content.
    _part: ($) =>
      prec.dynamic(
        1,
        seq(optional($._tail), choice($._run, $._start, $._group)),
      ),
    // A new HTTP prefix is a prose link, rather than group content. This
    // prevents speculative group stacks from accumulating across URLs.
    _group: ($) =>
      seq($._open, repeat(choice($._run, $._tail, $._group)), $._close),
  },
});
