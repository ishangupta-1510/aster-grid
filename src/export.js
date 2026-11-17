/** CSV, TSV and a minimal standards-based XLSX writer, implemented from scratch. */
const encoder = new TextEncoder();
const xml = (value) =>
  String(value ?? "")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
    .replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&apos;",
        })[c],
    );
export function delimited(rows, separator = ",", { safe = true } = {}) {
  return rows
    .map((row) =>
      row
        .map((value) => {
          let valueText = String(value ?? "");
          if (
            safe &&
            typeof value === "string" &&
            /^[\s]*[=+@-]/.test(valueText)
          )
            valueText = "'" + valueText;
          return valueText.includes(separator) || /["\r\n]/.test(valueText)
            ? '"' + valueText.replaceAll('"', '""') + '"'
            : valueText;
        })
        .join(separator),
    )
    .join("\r\n");
}
export function parseDelimited(input, separator = "\t") {
  if (!input) return [];
  const rows = [],
    row = [];
  let cell = "",
    quoted = false;
  for (let i = 0; i < input.length; i++) {
    const c = input[i];
    if (c === '"') {
      if (quoted && input[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (quoted || cell === "") quoted = !quoted;
      else cell += c;
    } else if (!quoted && c === separator) {
      row.push(cell);
      cell = "";
    } else if (!quoted && (c === "\r" || c === "\n")) {
      if (c === "\r" && input[i + 1] === "\n") i++;
      row.push(cell);
      rows.push([...row]);
      row.length = 0;
      cell = "";
    } else cell += c;
  }
  if (quoted) throw new Error("Unclosed quoted field");
  if (cell || row.length || !/[\r\n]$/.test(input)) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}
function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++)
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function header(size, fields) {
  const buffer = new Uint8Array(size),
    view = new DataView(buffer.buffer);
  for (const [offset, bytes, value] of fields)
    bytes === 4
      ? view.setUint32(offset, value, true)
      : view.setUint16(offset, value, true);
  return buffer;
}
function concat(chunks) {
  const result = new Uint8Array(chunks.reduce((sum, c) => sum + c.length, 0));
  let offset = 0;
  for (const c of chunks) {
    result.set(c, offset);
    offset += c.length;
  }
  return result;
}
function zip(files) {
  const locals = [],
    central = [];
  let offset = 0;
  for (const [path, content] of Object.entries(files)) {
    const name = encoder.encode(path),
      data = encoder.encode(content),
      crc = crc32(data);
    const local = header(30, [
      [0, 4, 0x04034b50],
      [4, 2, 20],
      [12, 2, 33],
      [14, 4, crc],
      [18, 4, data.length],
      [22, 4, data.length],
      [26, 2, name.length],
    ]);
    locals.push(local, name, data);
    central.push(
      header(46, [
        [0, 4, 0x02014b50],
        [4, 2, 20],
        [6, 2, 20],
        [14, 2, 33],
        [16, 4, crc],
        [20, 4, data.length],
        [24, 4, data.length],
        [28, 2, name.length],
        [42, 4, offset],
      ]),
      name,
    );
    offset += local.length + name.length + data.length;
  }
  const directory = concat(central),
    count = Object.keys(files).length;
  return concat([
    ...locals,
    directory,
    header(22, [
      [0, 4, 0x06054b50],
      [8, 2, count],
      [10, 2, count],
      [12, 4, directory.length],
      [16, 4, offset],
    ]),
  ]);
}
function columnName(index) {
  let s = "";
  do {
    s = String.fromCharCode(65 + (index % 26)) + s;
    index = Math.floor(index / 26) - 1;
  } while (index >= 0);
  return s;
}
export function xlsx(sheets) {
  if (!sheets.length) throw new Error("At least one sheet required");
  const ns = "http://schemas.openxmlformats.org/spreadsheetml/2006/main",
    rel = "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
    names = new Set();
  const files = {
    "_rels/.rels": `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${rel}/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
  };
  const sheetTags = [],
    relations = [],
    overrides = [];
  sheets.forEach((sheet, i) => {
    const name = sheet.name ?? `Sheet ${i + 1}`;
    if (
      !name ||
      name.length > 31 ||
      /[\\/?*\[\]:]/.test(name) ||
      names.has(name.toLowerCase())
    )
      throw new Error("Invalid or duplicate sheet name");
    names.add(name.toLowerCase());
    if (sheet.rows.length > 1048576 || sheet.rows.some((r) => r.length > 16384))
      throw new Error("Excel sheet size exceeded");
    const sheetRows = sheet.rows
      .map(
        (row, r) =>
          `<row r="${r + 1}">${row
            .map((value, c) => {
              const ref = columnName(c) + (r + 1);
              if (typeof value === "number" && Number.isFinite(value))
                return `<c r="${ref}"><v>${value}</v></c>`;
              if (typeof value === "boolean")
                return `<c r="${ref}" t="b"><v>${Number(value)}</v></c>`;
              return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${xml(value)}</t></is></c>`;
            })
            .join("")}</row>`,
      )
      .join("");
    files[`xl/worksheets/sheet${i + 1}.xml`] =
      `<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="${ns}"><sheetViews><sheetView workbookViewId="0">${sheet.freezeHeader ? '<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>' : ""}</sheetView></sheetViews><sheetData>${sheetRows}</sheetData></worksheet>`;
    sheetTags.push(
      `<sheet name="${xml(name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`,
    );
    relations.push(
      `<Relationship Id="rId${i + 1}" Type="${rel}/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`,
    );
    overrides.push(
      `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
    );
  });
  files["xl/workbook.xml"] =
    `<?xml version="1.0"?><workbook xmlns="${ns}" xmlns:r="${rel}"><sheets>${sheetTags.join("")}</sheets></workbook>`;
  files["xl/_rels/workbook.xml.rels"] =
    `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${relations.join("")}</Relationships>`;
  files["[Content_Types].xml"] =
    `<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${overrides.join("")}</Types>`;
  return zip(files);
}
export function download(content, filename, mime = "text/plain") {
  const url = URL.createObjectURL(new Blob([content], { type: mime })),
    a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
