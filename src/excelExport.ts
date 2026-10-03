import { strToU8, zipSync } from 'fflate'

export type SpreadsheetColumn = {
  header: string
  width: number
}

const escapeXml = (value: string): string =>
  [...value].filter((character) => {
    const codePoint = character.codePointAt(0) ?? 0
    return codePoint === 0x9 || codePoint === 0xa || codePoint === 0xd
      || (codePoint >= 0x20 && codePoint <= 0xd7ff)
      || (codePoint >= 0xe000 && codePoint <= 0xfffd)
      || (codePoint >= 0x10000 && codePoint <= 0x10ffff)
  }).join('').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&apos;',
  })[character] ?? character)

const columnName = (index: number): string => {
  let name = ''
  let value = index + 1
  while (value > 0) {
    value -= 1
    name = String.fromCharCode(65 + value % 26) + name
    value = Math.floor(value / 26)
  }
  return name
}

export const createSpreadsheet = (
  sheetName: string,
  columns: SpreadsheetColumn[],
  rows: string[][],
): Uint8Array => {
  if (!sheetName || sheetName.length > 31 || /[\\/*?:[\]]/.test(sheetName)
    || [...sheetName].some((character) => (character.codePointAt(0) ?? 0) < 0x20)) {
    throw new Error('Spreadsheet sheet name must be 1–31 characters and cannot contain \\ / * ? : [ or ].')
  }
  if (columns.length === 0) throw new Error('A spreadsheet must contain at least one column.')
  if (columns.some(({ width }) => !Number.isFinite(width) || width <= 0)) {
    throw new Error('Spreadsheet column widths must be positive finite numbers.')
  }
  if (rows.some((row) => row.length !== columns.length)) {
    throw new Error('Every spreadsheet row must contain one value per column.')
  }

  const allRows = [columns.map(({ header }) => header), ...rows]
  const sheetRows = allRows.map((row, rowIndex) => {
    const cells = row.map((value, columnIndex) => {
      const reference = `${columnName(columnIndex)}${rowIndex + 1}`
      return `<c r="${reference}" t="inlineStr"><is><t xml:space="preserve">${escapeXml(value)}</t></is></c>`
    }).join('')
    return `<row r="${rowIndex + 1}">${cells}</row>`
  }).join('')
  const finalCell = `${columnName(columns.length - 1)}${allRows.length}`
  const columnWidths = columns.map(({ width }, index) =>
    `<col min="${index + 1}" max="${index + 1}" width="${Math.max(1, width)}" customWidth="1"/>`,
  ).join('')
  const files: Record<string, Uint8Array> = {
    '[Content_Types].xml': strToU8(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
      '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
      '</Types>',
    ),
    '_rels/.rels': strToU8(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
      '</Relationships>',
    ),
    'xl/workbook.xml': strToU8(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
      `<sheets><sheet name="${escapeXml(sheetName)}" sheetId="1" r:id="rId1"/></sheets></workbook>`,
    ),
    'xl/_rels/workbook.xml.rels': strToU8(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>' +
      '</Relationships>',
    ),
    'xl/worksheets/sheet1.xml': strToU8(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
      `<dimension ref="A1:${finalCell}"/><cols>${columnWidths}</cols><sheetData>${sheetRows}</sheetData>` +
      `<autoFilter ref="A1:${columnName(columns.length - 1)}${allRows.length}"/></worksheet>`,
    ),
  }
  return zipSync(files, { level: 6 })
}
