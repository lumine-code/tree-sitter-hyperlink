#include "tree_sitter/parser.h"

#include <stddef.h>

enum TokenType { URL, TEXT };

// Small text tokens let incremental parses reuse the rest of a long paragraph.
enum { TEXT_CHUNK_SIZE = 4096 };

static bool is_hostname_character(int32_t character) {
  return (character >= 'a' && character <= 'z') ||
         (character >= 'A' && character <= 'Z') ||
         (character >= '0' && character <= '9') || character == '-' ||
         character == '_';
}

static bool is_accepting_character(int32_t character) {
  return (is_hostname_character(character) && character != '_') ||
         character == '&' || character == '@' || character == '\\' ||
         character == '^' || character == '$' || character == '=' ||
         character == '%' || character == '|' || character == '+' ||
         character == '#' || character == '/';
}

static bool is_middle_character(int32_t character) {
  switch (character) {
    case ':':
    case ',':
    case '.':
    case '!':
    case '?':
    case ';':
    case '{':
    case '}':
    case '[':
    case ']':
    case '_':
    case '*':
    case '`':
    case '~':
      return true;
    default:
      return false;
  }
}

// On failure, leave the first mismatching character unread. It may itself
// begin a URL, as in "hhttps://example.com". A prefix never crosses a range.
static bool scan_prefix(TSLexer *lexer, uint32_t *text_size) {
  const char *prefix = "http";
  while (*prefix) {
    if (lexer->eof(lexer) || lexer->lookahead != *prefix) return false;
    lexer->advance(lexer, false);
    (*text_size)++;
    prefix++;
    if (lexer->is_at_included_range_start(lexer)) return false;
  }
  if (lexer->lookahead == 's') {
    lexer->advance(lexer, false);
    (*text_size)++;
    if (lexer->is_at_included_range_start(lexer)) return false;
  }
  prefix = "://";
  while (*prefix) {
    if (lexer->eof(lexer) || lexer->lookahead != *prefix) return false;
    lexer->advance(lexer, false);
    (*text_size)++;
    prefix++;
    if (lexer->is_at_included_range_start(lexer)) return false;
  }
  return !lexer->eof(lexer) && is_hostname_character(lexer->lookahead);
}

static bool scan_url(TSLexer *lexer) {
  uint32_t parentheses = 0;
  bool has_end = false;
  while (!lexer->eof(lexer)) {
    int32_t character = lexer->lookahead;
    if (character == '(') {
      parentheses++;
    } else if (character == ')') {
      if (parentheses == 0) break;
      parentheses--;
    } else if (!is_accepting_character(character) &&
               !is_middle_character(character)) {
      break;
    }
    lexer->advance(lexer, false);
    // Do not extend a URL into a group until its outermost parenthesis closes.
    if (parentheses == 0 &&
        (is_accepting_character(character) || character == ')')) {
      lexer->mark_end(lexer);
      has_end = true;
    }
    if (lexer->is_at_included_range_start(lexer)) break;
  }
  return has_end;
}

void *tree_sitter_hyperlink_external_scanner_create(void) { return NULL; }

bool tree_sitter_hyperlink_external_scanner_scan(
  void *payload, TSLexer *lexer, const bool *valid_symbols
) {
  (void)payload;
  if (lexer->eof(lexer)) return false;

  bool has_text = false;
  uint32_t text_size = 0;
  while (!lexer->eof(lexer)) {
    if (has_text && (text_size >= TEXT_CHUNK_SIZE ||
                     lexer->is_at_included_range_start(lexer))) break;
    if (lexer->lookahead == 'h' && valid_symbols[URL]) {
      // Preserve the end of preceding text while looking ahead for a prefix.
      if (has_text) lexer->mark_end(lexer);
      if (scan_prefix(lexer, &text_size)) {
        if (has_text) {
          if (!valid_symbols[TEXT]) return false;
          lexer->result_symbol = TEXT;
          return true;
        }
        if (scan_url(lexer)) {
          lexer->result_symbol = URL;
          return true;
        }
        // A host consisting entirely of non-accepting characters is text.
        if (!valid_symbols[TEXT]) return false;
        lexer->mark_end(lexer);
        lexer->result_symbol = TEXT;
        return true;
      }
      has_text = true;
      if (lexer->is_at_included_range_start(lexer)) break;
      continue;
    }
    int32_t character = lexer->lookahead;
    lexer->advance(lexer, false);
    has_text = true;
    text_size++;
    if (character == '\n' || character == '\r') break;
  }
  if (!has_text || !valid_symbols[TEXT]) return false;
  lexer->mark_end(lexer);
  lexer->result_symbol = TEXT;
  return true;
}

unsigned tree_sitter_hyperlink_external_scanner_serialize(
  void *payload, char *buffer
) {
  (void)payload;
  (void)buffer;
  return 0;
}

void tree_sitter_hyperlink_external_scanner_deserialize(
  void *payload, const char *buffer, unsigned length
) {
  (void)payload;
  (void)buffer;
  (void)length;
}

void tree_sitter_hyperlink_external_scanner_destroy(void *payload) {
  (void)payload;
}
