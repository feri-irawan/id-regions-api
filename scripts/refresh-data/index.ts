/**
 * Checks the upstream datasets for postal code and name fixes.
 *
 * Usage: bun run data:refresh [--write]
 *
 * Without --write it only prints what would change.
 */
import fs from 'fs'
import path from 'path'
import {
  parseCrossCheck,
  parseNames,
  parsePostalCodes,
  refresh,
  type DataFiles,
} from './refresh'

const SOURCES = {
  postalCodes2022:
    'https://raw.githubusercontent.com/cahyadsn/wilayah_kodepos/main/db/archive/wilayah_kodepos_2023.sql',
  postalCodes2025:
    'https://raw.githubusercontent.com/cahyadsn/wilayah_kodepos/main/db/wilayah_kodepos.sql',
  names2022:
    'https://raw.githubusercontent.com/cahyadsn/wilayah/master/db/archive/wilayah_2023.sql',
  names2025:
    'https://raw.githubusercontent.com/cahyadsn/wilayah/master/db/wilayah.sql',
  crossCheck:
    'https://raw.githubusercontent.com/erlange/Kodepos-Wilayah-Indonesia/master/json/kodepos.extended.json',
}

const DATA_DIR = path.join(__dirname, '..', '..', 'src', 'data')
const write = process.argv.includes('--write')

const download = async (url: string) => {
  console.log(`Downloading ${url}`)
  const res = await fetch(url)
  if (!res.ok) throw new Error(`${url} returned ${res.status}`)
  return res.text()
}

const fileNames: Record<keyof DataFiles, string> = {
  desa: 'desa.csv',
  kecamatan: 'kecamatan.csv',
  kodepos: 'kodepos.csv',
}
const read = (key: keyof DataFiles) =>
  fs.readFileSync(path.join(DATA_DIR, fileNames[key]), 'utf8')

async function main() {
  const [postalCodes2022, postalCodes2025, names2022, names2025, crossCheck] =
    await Promise.all([
      download(SOURCES.postalCodes2022).then(parsePostalCodes),
      download(SOURCES.postalCodes2025).then(parsePostalCodes),
      download(SOURCES.names2022).then(parseNames),
      download(SOURCES.names2025).then(parseNames),
      download(SOURCES.crossCheck).then(parseCrossCheck),
    ])

  const current: DataFiles = {
    desa: read('desa'),
    kecamatan: read('kecamatan'),
    kodepos: read('kodepos'),
  }

  const { files, report } = refresh(current, {
    postalCodes2022,
    postalCodes2025,
    names2022,
    names2025,
    crossCheck,
  })

  const list = (title: string, items: string[]) => {
    if (!items.length) return
    console.log(`\n${title}:`)
    for (const item of items) console.log(`  ${item}`)
  }

  list('Renamed', report.renamed)
  list('Corrected postal codes', report.corrected)
  list('Broken names without an official name', report.unresolvedNames)
  console.log()
  console.log(`Filled postal codes: ${report.filled}`)
  console.log(`Filled after cross-check: ${report.filledWithCrossCheck}`)
  console.log(`Corrected postal codes: ${report.corrected.length}`)
  console.log(`Renamed regions: ${report.renamed.length}`)
  console.log(`Villages still without a postal code: ${report.stillEmpty}`)

  const changed = (Object.keys(fileNames) as (keyof DataFiles)[]).filter(
    (key) => files[key] !== current[key]
  )

  if (!changed.length) {
    console.log('\nThe data is up to date.')
  } else if (write) {
    for (const key of changed) {
      fs.writeFileSync(path.join(DATA_DIR, fileNames[key]), files[key])
    }
    console.log(`\nUpdated ${changed.map((key) => fileNames[key]).join(', ')}.`)
  } else {
    console.log('\nRun with --write to apply these changes.')
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
