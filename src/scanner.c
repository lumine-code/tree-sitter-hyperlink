#include "tree_sitter/parser.h"
#include "tree_sitter/alloc.h"

#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>

enum TokenType {
  START, RANGE_START, RUN, TAIL, OPEN, CLOSE, TEXT, RANGE_TEXT,
};
enum { TEXT_CHUNK_SIZE = 4096 };

typedef struct {
  // This changes batching only. No matching decision depends on a cached
  // future suffix, a source position, or a cumulative parenthesis depth.
  bool in_url;
} Scanner;

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

static bool at_boundary(TSLexer *lexer) {
  return lexer->eof(lexer) || lexer->is_at_included_range_start(lexer);
}

static bool emit(TSLexer *lexer, const bool *valid_symbols, enum TokenType symbol) {
  if (!valid_symbols[symbol]) return false;
  lexer->result_symbol = symbol;
  return true;
}

// Consume only a bounded prefix on failure and leave its mismatching character
// unread. It may start another prefix, as in "hhttps://example.com".
// A caller with preceding prose keeps its mark; an existing URL continuation
// may mark accepted prefix characters even when the prefix later fails.
static bool scan_prefix(
  TSLexer *lexer, uint32_t *count, bool *last_accepting, bool mark_progress
) {
  const char *prefix = "http";
  while (*prefix) {
    if (lexer->eof(lexer) || lexer->lookahead != *prefix) return false;
    *last_accepting = is_accepting_character(lexer->lookahead);
    lexer->advance(lexer, false);
    if (mark_progress && *last_accepting) lexer->mark_end(lexer);
    (*count)++;
    prefix++;
    if (at_boundary(lexer)) return false;
  }
  if (lexer->lookahead == 's') {
    *last_accepting = true;
    lexer->advance(lexer, false);
    if (mark_progress) lexer->mark_end(lexer);
    (*count)++;
    if (at_boundary(lexer)) return false;
  }
  prefix = "://";
  while (*prefix) {
    if (lexer->eof(lexer) || lexer->lookahead != *prefix) return false;
    *last_accepting = is_accepting_character(lexer->lookahead);
    lexer->advance(lexer, false);
    if (mark_progress && *last_accepting) lexer->mark_end(lexer);
    (*count)++;
    prefix++;
    if (at_boundary(lexer)) return false;
  }
  return !lexer->eof(lexer) && is_hostname_character(lexer->lookahead);
}

static bool scan_run(
  TSLexer *lexer, const bool *valid_symbols, uint32_t count,
  bool has_accepting_end, bool last_accepting
) {
  while (!lexer->eof(lexer) && count < TEXT_CHUNK_SIZE) {
    if (count && lexer->is_at_included_range_start(lexer)) break;
    int32_t character = lexer->lookahead;
    if (character == 'h' && count) {
      if (has_accepting_end && !last_accepting) break;
      lexer->mark_end(lexer);
      uint32_t prefix_size = 0;
      bool prefix_accepting = false;
      if (scan_prefix(lexer, &prefix_size, &prefix_accepting, false) || !prefix_accepting) {
        return emit(lexer, valid_symbols, has_accepting_end ? RUN : TAIL);
      }
      count += prefix_size;
      has_accepting_end = last_accepting = true;
      lexer->mark_end(lexer);
      continue;
    }
    if (!is_accepting_character(character) && !is_middle_character(character)) break;
    last_accepting = is_accepting_character(character);
    lexer->advance(lexer, false);
    count++;
    if (last_accepting) {
      has_accepting_end = true;
      lexer->mark_end(lexer);
    }
    if (at_boundary(lexer)) break;
  }
  if (!count) return false;
  if (!has_accepting_end) lexer->mark_end(lexer);
  return emit(lexer, valid_symbols, has_accepting_end ? RUN : TAIL);
}

void *tree_sitter_hyperlink_external_scanner_create(void) {
  return ts_calloc(1, sizeof(Scanner));
}

void tree_sitter_hyperlink_external_scanner_destroy(void *payload) {
  ts_free(payload);
}

unsigned tree_sitter_hyperlink_external_scanner_serialize(void *payload, char *buffer) {
  if (!payload) return 0;
  buffer[0] = ((Scanner *)payload)->in_url ? 1 : 0;
  return 1;
}

void tree_sitter_hyperlink_external_scanner_deserialize(
  void *payload, const char *buffer, unsigned length
) {
  if (payload) ((Scanner *)payload)->in_url = length == 1 && buffer && buffer[0] == 1;
}

bool tree_sitter_hyperlink_external_scanner_scan(
  void *payload, TSLexer *lexer, const bool *valid_symbols
) {
  Scanner *scanner = payload;
  if (!scanner || lexer->eof(lexer)) return false;
  bool range_start = lexer->is_at_included_range_start(lexer);
  if (range_start) scanner->in_url = false;
  if (lexer->lookahead == '(' || lexer->lookahead == ')') {
    int32_t character = lexer->lookahead;
    lexer->advance(lexer, false);
    lexer->mark_end(lexer);
    // A token at a new range cannot finish a group from the preceding range.
    return emit(lexer, valid_symbols,
      range_start ? RANGE_TEXT : character == '(' ? OPEN : CLOSE);
  }

  uint32_t count = 0;
  bool last_accepting = false;
  if (lexer->lookahead == 'h') {
    if (scan_prefix(lexer, &count, &last_accepting, scanner->in_url)) {
      bool has_end = false;
      while (!lexer->eof(lexer) && count < TEXT_CHUNK_SIZE &&
             !lexer->is_at_included_range_start(lexer) &&
             (is_accepting_character(lexer->lookahead) || is_middle_character(lexer->lookahead))) {
        int32_t character = lexer->lookahead;
        lexer->advance(lexer, false);
        count++;
        if (is_accepting_character(character)) {
          has_end = true;
          lexer->mark_end(lexer);
        }
      }
      if (has_end) {
        scanner->in_url = true;
        return emit(lexer, valid_symbols, range_start ? RANGE_START : START);
      }
      if (scanner->in_url) return emit(lexer, valid_symbols, RUN);
      lexer->mark_end(lexer);
      scanner->in_url = false;
      return emit(lexer, valid_symbols, range_start ? RANGE_TEXT : TEXT);
    }
    if (scanner->in_url) {
      return scan_run(lexer, valid_symbols, count, true, last_accepting);
    }
  } else if (scanner->in_url &&
             (is_accepting_character(lexer->lookahead) || is_middle_character(lexer->lookahead))) {
    return scan_run(lexer, valid_symbols, 0, false, false);
  }

  scanner->in_url = false;
  while (!lexer->eof(lexer) && count < TEXT_CHUNK_SIZE) {
    if (count && lexer->is_at_included_range_start(lexer)) break;
    if (lexer->lookahead == '(' || lexer->lookahead == ')') break;
    if (lexer->lookahead == 'h') {
      if (count) lexer->mark_end(lexer);
      uint32_t prefix_size = 0;
      bool prefix_accepting = false;
      if (scan_prefix(lexer, &prefix_size, &prefix_accepting, false) && count) {
        return emit(lexer, valid_symbols, range_start ? RANGE_TEXT : TEXT);
      }
      count += prefix_size;
      continue;
    }
    lexer->advance(lexer, false);
    count++;
  }
  if (!count) return false;
  lexer->mark_end(lexer);
  return emit(lexer, valid_symbols, range_start ? RANGE_TEXT : TEXT);
}
