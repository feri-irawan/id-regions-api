import fs from 'fs'
import path from 'path'

const DATA_DIR = path.join(__dirname, '..', 'data')

export interface Region {
  code: number
  name: string
}

interface ChildRegion extends Region {
  parentCode: number
}

/**
 * Reads a semicolon-separated data file, without its header row.
 *
 * Values never contain the separator, but some upstream names are wrapped in
 * stray quotes (e.g. `"""35 Ilir"""`), so those are stripped.
 */
const readRows = (fileName: string) =>
  fs
    .readFileSync(path.join(DATA_DIR, fileName), 'utf8')
    .split(/\r?\n/)
    .slice(1)
    .filter((line) => line !== '')
    .map((line) =>
      line.split(';').map((value) => value.replace(/^"+|"+$/g, ''))
    )

const indexRegions = (regions: ChildRegion[]) => {
  const byCode = new Map<number, ChildRegion>()
  const byParent = new Map<number, Region[]>()

  for (const region of regions) {
    byCode.set(region.code, region)

    const siblings = byParent.get(region.parentCode) ?? []
    siblings.push({ code: region.code, name: region.name })
    byParent.set(region.parentCode, siblings)
  }

  return { byCode, byParent }
}

const loadData = () => {
  const provinces = readRows('provinsi.csv').map(([code, name]) => ({
    code: Number(code),
    name,
  }))

  return {
    provinces,
    provinceByCode: new Map<number, Region>(provinces.map((p) => [p.code, p])),
    regencies: indexRegions(
      readRows('kabupaten.csv').map(([code, name, provinceCode]) => ({
        code: Number(code),
        name,
        parentCode: Number(provinceCode),
      }))
    ),
    districts: indexRegions(
      readRows('kecamatan.csv').map(([regencyCode, code, name]) => ({
        code: Number(code),
        name,
        parentCode: Number(regencyCode),
      }))
    ),
    villages: indexRegions(
      readRows('desa.csv').map(([districtCode, code, name]) => ({
        code: Number(code),
        name,
        parentCode: Number(districtCode),
      }))
    ),
    postalCodes: new Map<number, number | null>(
      readRows('kodepos.csv').map(([villageCode, postalCode]) => [
        Number(villageCode),
        postalCode ? Number(postalCode) : null,
      ])
    ),
  }
}

// Loaded on first use and kept for the lifetime of the process
let data: ReturnType<typeof loadData> | undefined
const getData = () => (data ??= loadData())

export function readProvinces(): Region[] {
  return getData().provinces
}

export function readRegencies(provinceCode: number): Region[] {
  return getData().regencies.byParent.get(provinceCode) ?? []
}

export function readDistricts(regencyCode: number): Region[] {
  return getData().districts.byParent.get(regencyCode) ?? []
}

export function readVillages(districtCode: number): Region[] {
  return getData().villages.byParent.get(districtCode) ?? []
}

export function readPostalCode(villageCode: number) {
  return getData().postalCodes.get(villageCode) ?? null
}

export const findProvince = (code: number) => getData().provinceByCode.get(code)

export const findRegency = (code: number) =>
  getData().regencies.byCode.get(code)

export const findDistrict = (code: number) =>
  getData().districts.byCode.get(code)

export const findVillage = (code: number) => getData().villages.byCode.get(code)

const toRegion = ({ code, name }: Region): Region => ({ code, name })

/**
 * Returns the full hierarchy of a village, or null when the codes do not
 * form a valid province > regency > district > village chain.
 */
export function getFullData(
  provinceCode: number,
  regencyCode: number,
  districtCode: number,
  villageCode: number
) {
  const province = findProvince(provinceCode)
  const regency = findRegency(regencyCode)
  const district = findDistrict(districtCode)
  const village = findVillage(villageCode)

  if (
    !province ||
    regency?.parentCode !== province.code ||
    district?.parentCode !== regency.code ||
    village?.parentCode !== district.code
  ) {
    return null
  }

  return {
    province: toRegion(province),
    regency: toRegion(regency),
    district: toRegion(district),
    village: toRegion(village),
    postalCode: readPostalCode(village.code),
  }
}

/** Returns the full hierarchy of a village from its code alone. */
export function getFullDataByVillage(villageCode: number) {
  const village = findVillage(villageCode)
  const district = village && findDistrict(village.parentCode)
  const regency = district && findRegency(district.parentCode)
  if (!village || !district || !regency) return null

  return getFullData(
    regency.parentCode,
    regency.code,
    district.code,
    village.code
  )
}
