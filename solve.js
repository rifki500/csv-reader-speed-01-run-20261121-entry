// Fast drop-in for csv-reader 1.0.0: same answers, less CPU.
//
// Strategy: never walk the text one character at a time. Plain records
// (no quote, no stray carriage return on the line) are cut out with
// indexOf + split. Everything else is parsed field by field, each field
// found with indexOf scans for its terminator and cut out with slice,
// so the work per field is a few native scans instead of a loop over
// every character. Quoted fields are found the same way: the closing
// quote is located with indexOf, doubled quotes collapsed as they are
// met, and CR / CRLF inside quotes normalised to LF in one replace.
//
// Semantics (csv-reader 1.0.0): BOM dropped; a record ends at LF or
// CRLF; an empty line is no record; a CR outside quotes that is not
// followed by LF is dropped (stray_cr); a field opening with a quote
// runs to the next undoubled quote, "" inside is one quote, CRLF and
// lone CR inside read as LF, text after the closing quote up to the
// next comma or line break is appended as it stands (quote_junk when
// the field ends); a quote that never closes is a literal character
// and the text after it is read again as unquoted
// (unterminated_quote); a quote inside an unquoted field is literal.
// columns is the first record when header is true, else null; rows are
// the records after it, padded (short_row) or cut (long_row) to the
// first record's width. Errors are {code, line, row} in the order met,
// line the 1-based line the record starts on.

const COMMA = 0;
const LINE_BREAK = 1;
const END = 2;

/** csv-reader 1.0.0's answer for one case's input. */
export function run(input) {
  const text = String(input.text);
  const header = input.header === true;
  const errors = [];
  const rows = [];
  const len = text.length;
  let columns = null;
  let width = -1;

  let pos = text.charCodeAt(0) === 0xfeff ? 1 : 0;
  let line = 1;
  let recordLine = 1;
  let recordRow = null;

  function finishRecord(fields) {
    if (width < 0) width = fields.length;
    if (header && columns === null) {
      columns = fields;
      return;
    }
    if (fields.length < width) {
      errors.push({ code: 'short_row', line: recordLine, row: recordRow, fields: fields.length });
      while (fields.length < width) fields.push('');
    } else if (fields.length > width) {
      errors.push({ code: 'long_row', line: recordLine, row: recordRow, extra: fields.splice(width) });
    }
    rows.push(fields);
  }

  // Reads unquoted characters onto `value` up to the next comma or line
  // break. A CR not followed by LF is dropped (stray_cr). Returns the
  // field, how it ended, and how many characters were kept.
  function readUnquoted(value) {
    let added = 0;
    let start = pos;
    for (;;) {
      const c = text.indexOf(',', pos);
      const n = text.indexOf('\n', pos);
      const r = text.indexOf('\r', pos);
      let m = -1;
      let kind = 0;
      if (c !== -1) {
        m = c;
        kind = 0;
      }
      if (n !== -1 && (m === -1 || n < m)) {
        m = n;
        kind = 1;
      }
      if (r !== -1 && (m === -1 || r < m)) {
        m = r;
        kind = 2;
      }
      if (m === -1) {
        if (start < len) {
          value += text.slice(start, len);
          added += len - start;
        }
        pos = len;
        return { value, ended: END, added };
      }
      if (kind === 2 && text.charCodeAt(m + 1) === 10) {
        if (m > start) {
          value += text.slice(start, m);
          added += m - start;
        }
        pos = m + 2;
        line += 1;
        return { value, ended: LINE_BREAK, added };
      }
      if (kind === 0) {
        if (m > start) {
          value += text.slice(start, m);
          added += m - start;
        }
        pos = m + 1;
        return { value, ended: COMMA, added };
      }
      if (kind === 1) {
        if (m > start) {
          value += text.slice(start, m);
          added += m - start;
        }
        pos = m + 1;
        line += 1;
        return { value, ended: LINE_BREAK, added };
      }
      // A lone CR: dropped, and the field goes on after it.
      if (m > start) {
        value += text.slice(start, m);
        added += m - start;
      }
      errors.push({ code: 'stray_cr', line: recordLine, row: recordRow });
      pos = m + 1;
      start = m + 1;
    }
  }

  // Reads a quoted field whose opening quote is at pos.
  function readQuoted() {
    const open = pos;
    const openLine = line;
    let value = '';
    let addLines = 0;
    let cur = pos + 1;
    let closedAt = -1;

    // Appends text[a..b) to value, normalising CR and CRLF inside it to
    // LF and counting the line breaks it holds.
    function addSeg(a, b) {
      if (a >= b) return;
      const seg = text.slice(a, b);
      if (seg.indexOf('\r') === -1 && seg.indexOf('\n') === -1) {
        value += seg;
        return;
      }
      const breaks = seg.match(/\r\n?|\n/g);
      if (breaks !== null) addLines += breaks.length;
      value += seg.replace(/\r\n?/g, '\n');
    }

    for (;;) {
      const q = text.indexOf('"', cur);
      if (q === -1) break;
      if (text.charCodeAt(q + 1) === 34) {
        addSeg(cur, q);
        value += '"';
        cur = q + 2;
        continue;
      }
      addSeg(cur, q);
      closedAt = q;
      break;
    }

    if (closedAt === -1) {
      // The quote never closes: it is a literal character, and the text
      // after it is read again as unquoted.
      pos = open + 1;
      line = openLine;
      errors.push({ code: 'unterminated_quote', line: recordLine, row: recordRow });
      return readUnquoted('"');
    }
    line += addLines;
    pos = closedAt + 1;
    if (pos >= len) return { value, ended: END };
    const ch = text.charCodeAt(pos);
    if (ch === 44) {
      pos += 1;
      return { value, ended: COMMA };
    }
    if (ch === 10) {
      pos += 1;
      line += 1;
      return { value, ended: LINE_BREAK };
    }
    if (ch === 13 && text.charCodeAt(pos + 1) === 10) {
      pos += 2;
      line += 1;
      return { value, ended: LINE_BREAK };
    }
    // What follows the closing quote is appended as it stands, up to
    // the next comma or line break.
    const junk = readUnquoted(value);
    if (junk.added > 0) {
      errors.push({ code: 'quote_junk', line: recordLine, row: recordRow });
    }
    return junk;
  }

  for (;;) {
    // Lines with no characters are no records.
    while (pos < len) {
      const ch = text.charCodeAt(pos);
      if (ch === 10) {
        pos += 1;
        line += 1;
      } else if (ch === 13 && text.charCodeAt(pos + 1) === 10) {
        pos += 2;
        line += 1;
      } else {
        break;
      }
    }
    if (pos >= len) break;

    recordLine = line;
    recordRow = header && columns === null ? null : rows.length;

    // Fast path: a line with no quote and no stray CR is one split.
    const nl = text.indexOf('\n', pos);
    const lineEnd = nl === -1 ? len : nl;
    const q = text.indexOf('"', pos);
    if (q === -1 || q >= lineEnd) {
      const r = text.indexOf('\r', pos);
      if (r === -1 || r >= lineEnd || (nl !== -1 && r === lineEnd - 1)) {
        const end =
          nl !== -1 && lineEnd > pos && text.charCodeAt(lineEnd - 1) === 13 ? lineEnd - 1 : lineEnd;
        const fields = text.slice(pos, end).split(',');
        pos = nl === -1 ? len : nl + 1;
        line += 1;
        finishRecord(fields);
        continue;
      }
    }

    const fields = [];
    let field;
    let quoted = false;
    do {
      quoted = text.charCodeAt(pos) === 34;
      field = quoted ? readQuoted() : readUnquoted('');
      fields.push(field.value);
    } while (field.ended === COMMA);

    // A line that held only stray CRs is left with no characters: no
    // record (its stray_cr errors stay).
    if (fields.length === 1 && fields[0] === '' && !quoted) continue;

    finishRecord(fields);
  }

  return { columns: header ? (columns ?? []) : null, rows, errors };
}
