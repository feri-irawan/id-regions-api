/**
 * Fills missing postal codes, corrects wrong ones and repairs truncated
 * region names in src/data, using open datasets keyed by Kemendagri codes.
 *
 * Values are only copied from MIT-licensed cahyadsn datasets. The GPL-3.0
 * erlange dataset is only used to confirm a value, never as its only source.
 */

export interface Sources {
  /** Postal codes by village code, Kepmendagri 100.1.1-6117 Tahun 2022 */
  postalCodes2022: Map<string, string>
  /** Postal codes by village code, current Kepmendagri */
  postalCodes2025: Map<string, string>
  /** Official district and village names, Kepmendagri 2022 */
  names2022: Map<string, string>
  /** Official district and village names, current Kepmendagri */
  names2025: Map<string, string>
  /** Independent village names and postal codes, for confirmation only */
  crossCheck: Map<string, { name: string; postalCode: string }>
}

export interface DataFiles {
  desa: string
  kecamatan: string
  kodepos: string
}

export interface Report {
  filled: number
  filledWithCrossCheck: number
  corrected: string[]
  renamed: string[]
  unresolvedNames: string[]
  stillEmpty: number
}

const stripDots = (code: string) => code.replace(/\./g, '')

/** Parses `('11.01.01.2001', '23773')` rows into village code -> postal code */
export function parsePostalCodes(sql: string) {
  const rows = sql.matchAll(/\('(\d\d\.\d\d\.\d\d\.\d{4})',\s*'(\d{5})'\)/g)
  return new Map(
    Array.from(rows, ([, code, postalCode]) => [stripDots(code!), postalCode!])
  )
}

/** Parses `('11.01.01', 'Bakongan')` rows for districts and villages */
export function parseNames(sql: string) {
  const rows = sql.matchAll(
    /\('(\d\d\.\d\d\.\d\d(?:\.\d{4})?)',\s*'((?:[^']|'')*)'\)/g
  )
  return new Map(
    Array.from(rows, ([, code, name]) => [
      stripDots(code!),
      name!.replace(/''/g, "'"),
    ])
  )
}

/** Collects the villages from the nested erlange kodepos.extended.json */
export function parseCrossCheck(json: string) {
  const villages = new Map<string, { name: string; postalCode: string }>()
  const walk = (node: unknown, name: string) => {
    if (!node || typeof node !== 'object') return
    const { ID: id, 'Kode Pos': postalCode } = node as Record<string, unknown>
    if (typeof id === 'string' && typeof postalCode === 'string') {
      villages.set(stripDots(id), { name, postalCode })
    }
    for (const [key, child] of Object.entries(node)) walk(child, key)
  }
  walk(JSON.parse(json.replace(/^﻿/, '')), '')
  return villages
}

const normalize = (text: string) =>
  text
    .toLowerCase()
    .replace(/^(desa|kelurahan|gampong|nagari)\s+/, '')
    .replace(/[^a-z0-9]/g, '')

/** Every spelling a name offers: its main part, bracketed aliases and "/" alternatives */
const variants = (name: string) => {
  const main = name.replace(/\(.*?(\)|$)/g, '')
  const aliases = Array.from(name.matchAll(/\(([^)]*)\)?/g), (m) => m[1]!)
  return new Set(
    [main, ...aliases]
      .flatMap((part) => part.split('/'))
      .map(normalize)
      .filter(Boolean)
  )
}

const editDistance = (a: string, b: string) => {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    let diagonal = row[0]!
    row[0] = i
    for (let j = 1; j <= b.length; j++) {
      const above = row[j]!
      row[j] = Math.min(
        above + 1,
        row[j - 1]! + 1,
        diagonal + (a[i - 1] === b[j - 1] ? 0 : 1)
      )
      diagonal = above
    }
  }
  return row[b.length]!
}

/**
 * Whether two names refer to the same place: any spelling matches exactly,
 * or differs by at most 20% of its characters (for names of 5+ characters).
 */
export function sameName(a: string, b: string | undefined) {
  if (!b) return false
  for (const x of variants(a)) {
    for (const y of variants(b)) {
      if (x === y) return true
      const length = Math.max(x.length, y.length)
      if (
        Math.min(x.length, y.length) >= 5 &&
        editDistance(x, y) / length <= 0.2
      ) {
        return true
      }
    }
  }
  return false
}

const unquote = (name: string) => name.replace(/^"+|"+$/g, '')

/** Upstream cut some names at a comma, leaving `"""Koja (Utara"`, or left a stray `)` or `}` */
export function isBrokenName(raw: string) {
  const name = unquote(raw)
  return (
    (raw.startsWith('"""') && !raw.endsWith('"""')) ||
    name.split('(').length !== name.split(')').length ||
    /[{}]/.test(name)
  )
}

/** Picks the official name whose spelling matches the broken name's main part */
export function repairName(raw: string, officialNames: (string | undefined)[]) {
  const options = officialNames
    .filter((name): name is string => !!name)
    .map((name) => name.replace(/[’‘`]/g, "'"))
  const main = normalize(unquote(raw).replace(/\(.*$/, '').replace(/[()]/g, ''))

  return (
    options.find((name) => normalize(name) === main) ??
    options.find((name) => normalize(name).startsWith(main)) ??
    options[0]
  )
}

const splitLines = (csv: string) => csv.replace(/\n$/, '').split('\n')
const joinLines = (lines: string[]) => lines.join('\n') + '\n'

export function refresh(files: DataFiles, sources: Sources) {
  const report: Report = {
    filled: 0,
    filledWithCrossCheck: 0,
    corrected: [],
    renamed: [],
    unresolvedNames: [],
    stillEmpty: 0,
  }

  // Names first, so postal codes are matched against the repaired names
  const repairNames = (csv: string, codeColumn: number) =>
    splitLines(csv).map((line, index) => {
      const columns = line.split(';')
      const code = columns[codeColumn]!
      const raw = columns[2]!
      if (index === 0 || !isBrokenName(raw)) return line

      const official = repairName(raw, [
        sources.names2022.get(code),
        sources.names2025.get(code),
      ])
      if (!official) {
        report.unresolvedNames.push(`${code} ${raw}`)
        return line
      }

      report.renamed.push(`${code}: ${unquote(raw)} -> ${official}`)
      columns[2] = official
      return columns.join(';')
    })

  const desaLines = repairNames(files.desa, 1)
  const kecamatanLines = repairNames(files.kecamatan, 1)

  const villageNames = new Map(
    desaLines.slice(1).map((line) => {
      const [, code, name] = line.split(';')
      return [code!, unquote(name!)]
    })
  )

  const kodeposLines = splitLines(files.kodepos).map((line, index) => {
    if (index === 0) return line

    const [code = '', current = ''] = line.split(';')
    const name = villageNames.get(code) ?? ''
    const versions = [
      sources.postalCodes2022.get(code),
      sources.postalCodes2025.get(code),
    ].filter((value): value is string => !!value)

    // Both versions must agree when both have the village
    const value = new Set(versions).size === 1 ? versions[0] : undefined
    const sameVillage =
      (!!sources.postalCodes2022.get(code) &&
        sameName(name, sources.names2022.get(code))) ||
      (!!sources.postalCodes2025.get(code) &&
        sameName(name, sources.names2025.get(code)))
    const crossCheck = sources.crossCheck.get(code)
    const confirmed =
      !!crossCheck &&
      crossCheck.postalCode === value &&
      sameName(name, crossCheck.name)

    let next = current
    if (!current && value && sameVillage) {
      next = value
      report.filled++
    } else if (!current && value && confirmed) {
      next = value
      report.filledWithCrossCheck++
    } else if (current && value && value !== current && confirmed) {
      next = value
      report.corrected.push(`${code} ${name}: ${current} -> ${value}`)
    }

    if (!next) report.stillEmpty++
    return `${code};${next}`
  })

  return {
    files: {
      desa: joinLines(desaLines),
      kecamatan: joinLines(kecamatanLines),
      kodepos: joinLines(kodeposLines),
    },
    report,
  }
}
