import { describe, expect, test } from 'bun:test'
import {
  isBrokenName,
  parseCrossCheck,
  parseNames,
  parsePostalCodes,
  refresh,
  repairName,
  sameName,
  type Sources,
} from './refresh'

describe('parsers', () => {
  test('parsePostalCodes reads both SQL spacing styles', () => {
    const sql = `('11.01.01.2001', '23773'),\n('11.01.01.2002','23774');`
    expect(parsePostalCodes(sql)).toEqual(
      new Map([
        ['1101012001', '23773'],
        ['1101012002', '23774'],
      ])
    )
  })

  test('parseNames reads districts and villages and unescapes quotes', () => {
    const sql = `('11.01','Kabupaten Aceh Selatan'),\n('53.02.10','KI''E'),\n('53.07.01.2021','Regapu’u')`
    expect(parseNames(sql)).toEqual(
      new Map([
        ['530210', "KI'E"],
        ['5307012021', 'Regapu’u'],
      ])
    )
  })

  test('parseCrossCheck collects nested villages', () => {
    const json = JSON.stringify({
      Aceh: {
        ID: '11',
        Desa: {
          'Keude Bakongan': { ID: '11.01.01.2001', 'Kode Pos': '23773' },
        },
      },
    })
    expect(parseCrossCheck(json)).toEqual(
      new Map([['1101012001', { name: 'Keude Bakongan', postalCode: '23773' }]])
    )
  })
})

describe('sameName', () => {
  test.each([
    ['Gunung Pulo (Gunong Pulo)', 'Gunong Pulo'],
    ['Aron/Arun Tunggai', 'Arun Tunggai'],
    ['Simpang Empat Tanjung', 'Simpang Empat  Tanjung'],
    ['Desa Paya Bili', 'Paya Bili'],
  ])('%s matches %s', (a, b) => {
    expect(sameName(a, b)).toBe(true)
  })

  test.each([
    ['Banjar Jaya', 'Banjaran Raya'],
    ['Kisam', 'Kuta Buluh'],
    ['Kisam', undefined],
  ])('%s does not match %s', (a, b) => {
    expect(sameName(a, b)).toBe(false)
  })
})

describe('names', () => {
  test.each([
    ['"""Koja (Utara"', true],
    ['Paya Terbang Teureubang)', true],
    ['Sumanik (Sumaniak}', true],
    ['"""35 Ilir"""', false],
    ['Ujong Mangki (Ujung Mangki)', false],
  ])('isBrokenName(%s) is %s', (raw, broken) => {
    expect(isBrokenName(raw)).toBe(broken)
  })

  test('repairName prefers the spelling that matches the broken name', () => {
    expect(
      repairName('"""Palengaan (Palenggaan"', ['Palenggaan', 'Palengaan'])
    ).toBe('Palengaan')
    expect(repairName('"""Lambang Sari I"', ['Lambang Sari I, II, III'])).toBe(
      'Lambang Sari I, II, III'
    )
    expect(
      repairName('"""Pulau Ku (Pulau Kuu"', [undefined, 'Pulau Ku’u'])
    ).toBe("Pulau Ku'u")
    expect(repairName('"""Unknown (X"', [undefined, undefined])).toBeUndefined()
  })
})

describe('refresh', () => {
  const files = {
    desa:
      [
        'kode_kecamatan;kode_desa;nama_desa',
        '317203;3172031001;"""Koja (Utara"',
        '317409;3174091001;Jagakarsa',
        '120105;1201051001;Pasar Onan Manduamas',
        '120105;1201051002;Somewhere Else',
        '120105;1201051003;Not In Sources',
      ].join('\n') + '\n',
    kecamatan:
      'kode_kabupaten;kode_kecamatan;nama_kecamatan\n3172;317203;Koja\n',
    kodepos:
      [
        'kode_desa;kode_pos',
        '3172031001;',
        '3174091001;12630',
        '1201051001;',
        '1201051002;',
        '1201051003;',
      ].join('\n') + '\n',
  }

  const sources: Sources = {
    postalCodes2022: new Map([
      ['3172031001', '14110'],
      ['3174091001', '12620'],
      ['1201051001', '22565'],
      ['1201051002', '22566'],
    ]),
    postalCodes2025: new Map([
      ['3172031001', '14110'],
      ['3174091001', '12620'],
    ]),
    names2022: new Map([
      ['3172031001', 'Koja'],
      ['3174091001', 'Jagakarsa'],
      ['1201051001', 'P.O. Manduamas'],
      ['1201051002', 'Renamed Village'],
    ]),
    names2025: new Map([['3172031001', 'Koja']]),
    crossCheck: new Map([
      ['3174091001', { name: 'Jagakarsa', postalCode: '12620' }],
      ['1201051001', { name: 'Pasar Onan Manduamas', postalCode: '22565' }],
    ]),
  }

  const { files: result, report } = refresh(files, sources)

  test('repairs names before matching postal codes', () => {
    expect(result.desa).toContain('317203;3172031001;Koja\n')
    expect(result.kodepos).toContain('3172031001;14110\n')
    expect(report.renamed).toEqual(['3172031001: Koja (Utara -> Koja'])
  })

  test('corrects a value only when the cross-check agrees', () => {
    expect(result.kodepos).toContain('3174091001;12620\n')
    expect(report.corrected).toEqual(['3174091001 Jagakarsa: 12630 -> 12620'])
  })

  test('fills a renamed village only when the cross-check confirms it', () => {
    expect(result.kodepos).toContain('1201051001;22565\n')
    expect(result.kodepos).toContain('1201051002;\n')
    expect(report.filledWithCrossCheck).toBe(1)
  })

  test('leaves unconfirmed villages empty and unchanged files identical', () => {
    expect(result.kodepos).toContain('1201051003;\n')
    expect(report.stillEmpty).toBe(2)
    expect(result.kecamatan).toBe(files.kecamatan)
  })
})
