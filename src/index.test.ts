import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import type { Server } from 'http'
import type { AddressInfo } from 'net'
import app from './index'
import {
  readDistricts,
  readProvinces,
  readRegencies,
  readVillages,
} from './lib/reader'

let server: Server
let baseUrl: string

beforeAll(async () => {
  server = await new Promise<Server>((resolve) => {
    const listening = app.listen(0, () => resolve(listening))
  })
  baseUrl = `http://localhost:${(server.address() as AddressInfo).port}`
})

afterAll(() => {
  server.close()
})

const get = async (path: string) => {
  const res = await fetch(baseUrl + path)
  return { status: res.status, headers: res.headers, body: await res.json() }
}

describe('region lists', () => {
  test('GET /provinces', async () => {
    const { status, headers, body } = await get('/provinces')
    expect(status).toBe(200)
    expect(body.data).toHaveLength(38)
    expect(body.data[0]).toEqual({ code: 11, name: 'Aceh (NAD)' })
    expect(headers.get('cache-control')).toContain('s-maxage')
  })

  test('GET /regencies/:provinceCode', async () => {
    const { status, body } = await get('/regencies/11')
    expect(status).toBe(200)
    expect(body.data).toContainEqual({ code: 1101, name: 'Aceh Selatan' })
    for (const regency of body.data) {
      expect(String(regency.code).startsWith('11')).toBe(true)
    }
  })

  test('GET /districts/:regencyCode', async () => {
    const { status, body } = await get('/districts/1101')
    expect(status).toBe(200)
    expect(body.data).toContainEqual({ code: 110101, name: 'Bakongan' })
  })

  test('GET /villages/:districtCode', async () => {
    const { status, body } = await get('/villages/110101')
    expect(status).toBe(200)
    expect(body.data).toContainEqual({
      code: 1101012002,
      name: 'Ujong Mangki (Ujung Mangki)',
    })
  })

  test.each(['/regencies/abc', '/regencies/0x0B', '/regencies/11.0'])(
    'rejects invalid code %s',
    async (path) => {
      const { status, body } = await get(path)
      expect(status).toBe(400)
      expect(body).toEqual({ error: 'Invalid province code' })
    }
  )

  test.each([
    ['/regencies/99', 'Province 99 not found'],
    ['/districts/9999', 'Regency 9999 not found'],
    ['/villages/999999', 'District 999999 not found'],
  ])('returns 404 for unknown parent %s', async (path, error) => {
    const { status, body } = await get(path)
    expect(status).toBe(404)
    expect(body).toEqual({ error })
  })
})

describe('GET /postalcode/:villageCode', () => {
  test('returns the postal code of a village', async () => {
    const { status, body } = await get('/postalcode/1101012002')
    expect(status).toBe(200)
    expect(body).toEqual({ data: 23773 })
  })

  test('returns null for a village without a postal code', async () => {
    const { status, body } = await get('/postalcode/9671101002')
    expect(status).toBe(200)
    expect(body).toEqual({ data: null })
  })

  test('returns 404 for an unknown village', async () => {
    const { status } = await get('/postalcode/1')
    expect(status).toBe(404)
  })
})

describe('GET /full/:provinceCode/:regencyCode/:districtCode/:villageCode', () => {
  test('returns the full hierarchy', async () => {
    const { status, body } = await get('/full/11/1101/110101/1101012002')
    expect(status).toBe(200)
    expect(body).toEqual({
      data: {
        province: { code: 11, name: 'Aceh (NAD)' },
        regency: { code: 1101, name: 'Aceh Selatan' },
        district: { code: 110101, name: 'Bakongan' },
        village: { code: 1101012002, name: 'Ujong Mangki (Ujung Mangki)' },
        postalCode: 23773,
      },
    })
  })

  test.each([
    '/full/12/1101/110101/1101012002',
    '/full/11/1101/110102/1101012002',
    '/full/99/1/2/3',
  ])('returns 404 for mismatched codes %s', async (path) => {
    const { status } = await get(path)
    expect(status).toBe(404)
  })

  test('rejects invalid codes', async () => {
    const { status } = await get('/full/11/1101/x/1101012002')
    expect(status).toBe(400)
  })
})

describe('errors', () => {
  test('unknown routes return JSON', async () => {
    const { status, body } = await get('/nonexistent')
    expect(status).toBe(404)
    expect(body).toEqual({ error: 'Not found' })
  })

  test('malformed URLs return JSON without caching', async () => {
    const { status, headers, body } = await get('/regencies/%E0%A4%A')
    expect(status).toBe(400)
    expect(body).toEqual({ error: 'Bad Request' })
    expect(headers.get('cache-control')).toBe('no-store')
  })
})

describe('data', () => {
  test('names have no stray quotes or encoding artifacts', () => {
    const names: string[] = []
    for (const province of readProvinces()) {
      names.push(province.name)
      for (const regency of readRegencies(province.code)) {
        names.push(regency.name)
        for (const district of readDistricts(regency.code)) {
          names.push(district.name)
          names.push(...readVillages(district.code).map((v) => v.name))
        }
      }
    }

    expect(names).toHaveLength(38 + 514 + 7277 + 83762)
    expect(names.filter((name) => /["�]|ï¿½/.test(name))).toEqual([])
    expect(names).toContain('35 Ilir')
    expect(names).toContain("Regapu'u")
  })
})
