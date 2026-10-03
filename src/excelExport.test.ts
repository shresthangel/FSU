import { describe, expect, it } from 'vitest'
import { strFromU8, unzipSync } from 'fflate'
import { createSpreadsheet } from './excelExport'

describe('createSpreadsheet', () => {
  it('creates a readable Open XML workbook and safely encodes cell text', () => {
    const result = unzipSync(createSpreadsheet('Registrations', [
      { header: 'Name', width: 24 },
      { header: 'Notes', width: 40 },
    ], [['A & B', '=1+1 & <notes>']]))
    const workbook = strFromU8(result['xl/workbook.xml'])
    const worksheet = strFromU8(result['xl/worksheets/sheet1.xml'])

    expect(workbook).toContain('name="Registrations"')
    expect(worksheet).toContain('<dimension ref="A1:B2"/>')
    expect(worksheet).toContain('<autoFilter ref="A1:B2"/>')
    expect(worksheet).toContain('A &amp; B')
    expect(worksheet).toContain('=1+1 &amp; &lt;notes&gt;')
    expect(worksheet).toContain('t="inlineStr"')
  })

  it('rejects invalid workbook shapes and worksheet names', () => {
    expect(() => createSpreadsheet('Bad/Name', [{ header: 'Name', width: 20 }], [])).toThrow()
    expect(() => createSpreadsheet('Sheet', [], [])).toThrow()
    expect(() => createSpreadsheet('Sheet', [{ header: 'Name', width: 20 }], [['a', 'b']])).toThrow()
  })
})
