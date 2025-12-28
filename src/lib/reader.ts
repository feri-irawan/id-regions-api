import path from 'path'
import * as xlsx from 'xlsx'

const DATA_DIR = path.resolve('src', 'data')
const PROVINSI_FILE = path.join(DATA_DIR, 'provinsi.csv')
const KABUPATEN_FILE = path.join(DATA_DIR, 'kabupaten.csv')
const KECAMATAN_FILE = path.join(DATA_DIR, 'kecamatan.csv')
const DESA_FILE = path.join(DATA_DIR, 'desa.csv')
const KODEPOS_FILE = path.join(DATA_DIR, 'kodepos.csv')

const getRows = <T = unknown>(filePath: string) => {
  const workbook = xlsx.readFile(filePath, { type: 'buffer' })

  const sheetName = workbook.SheetNames[0]
  if (!sheetName) {
    throw new Error('Sheet not found')
  }

  const worksheet = workbook.Sheets[sheetName]
  if (!worksheet) {
    throw new Error('Worksheet not found')
  }

  return xlsx.utils.sheet_to_json<T>(worksheet, { header: 1 })
}

export function readProvinces() {
  const rows = getRows<[number, string]>(PROVINSI_FILE)

  return rows.slice(1).map((row) => ({
    code: row[0],
    name: row[1],
  }))
}

export function readRegencies(provinceCode: number) {
  const rows = getRows<[number, string, number]>(KABUPATEN_FILE)

  return rows
    .slice(1)
    .filter((row) => row[2] === provinceCode)
    .map((row) => ({
      code: row[0],
      name: row[1],
    }))
}

export function readDistricts(regencyCode: number) {
  const rows = getRows<[number, number, string]>(KECAMATAN_FILE)

  return rows
    .slice(1)
    .filter((row) => row[0] === regencyCode)
    .map((row) => ({
      code: row[1],
      name: row[2],
    }))
}

export function readVillages(districtCode: number) {
  const rows = getRows<[number, number, string]>(DESA_FILE)

  return rows
    .slice(1)
    .filter((row) => row[0] === districtCode)
    .map((row) => ({
      code: row[1],
      name: row[2],
    }))
}

export function readPostalCode(villageCode: number) {
  const rows = getRows<[number, number]>(KODEPOS_FILE)

  return rows.slice(1).find((row) => row[0] === villageCode)?.[1] || null
}

export function getFullData(
  provinceCode: number,
  regencyCode: number,
  districtCode: number,
  villageCode: number
) {
  return {
    province: readProvinces().find((row) => row.code === provinceCode),
    regency: readRegencies(provinceCode).find(
      (row) => row.code === regencyCode
    ),
    district: readDistricts(regencyCode).find(
      (row) => row.code === districtCode
    ),
    village: readVillages(districtCode).find((row) => row.code === villageCode),
    postalCode: readPostalCode(villageCode),
  }
}
