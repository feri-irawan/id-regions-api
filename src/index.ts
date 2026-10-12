import express, { type ErrorRequestHandler, type Response } from 'express'
import { STATUS_CODES } from 'http'
import {
  readProvinces,
  readRegencies,
  readDistricts,
  readVillages,
  readPostalCode,
  getFullData,
  getFullDataByVillage,
  findVillagesByPostalCode,
  searchRegions,
  isLevel,
  LEVELS,
  findProvince,
  findRegency,
  findDistrict,
  findVillage,
} from './lib/reader'
import cors from 'cors'

const app = express()

app.disable('x-powered-by')
app.use(cors())

// Region data only changes with a new deployment, which purges the CDN cache
app.use((_, res, next) => {
  res.set('Cache-Control', 'public, max-age=3600, s-maxage=86400')
  next()
})

const isCode = (value: string) => /^\d+$/.test(value)

/**
 * Parses a region code route parameter and checks that the region exists.
 * Sends a 400 or 404 response and returns null when it is not usable.
 */
const resolveCode = (
  res: Response,
  value: string,
  label: string,
  exists: (code: number) => unknown
) => {
  if (!isCode(value)) {
    res.status(400).json({ error: `Invalid ${label.toLowerCase()} code` })
    return null
  }

  const code = Number(value)
  if (!exists(code)) {
    res.status(404).json({ error: `${label} ${code} not found` })
    return null
  }

  return code
}

app.get('/', (_, res) => {
  res.json({
    message: 'Welcome to ID Regions API',
  })
})

app.get('/provinces', (_, res) => {
  res.json({
    data: readProvinces(),
  })
})

app.get('/regencies/:provinceCode', (req, res) => {
  const code = resolveCode(
    res,
    req.params.provinceCode,
    'Province',
    findProvince
  )
  if (code !== null) res.json({ data: readRegencies(code) })
})

app.get('/districts/:regencyCode', (req, res) => {
  const code = resolveCode(res, req.params.regencyCode, 'Regency', findRegency)
  if (code !== null) res.json({ data: readDistricts(code) })
})

app.get('/villages/:districtCode', (req, res) => {
  const code = resolveCode(
    res,
    req.params.districtCode,
    'District',
    findDistrict
  )
  if (code !== null) res.json({ data: readVillages(code) })
})

app.get('/villages/postalcode/:postalCode', (req, res) => {
  const { postalCode } = req.params
  if (!/^\d{5}$/.test(postalCode)) {
    res.status(400).json({ error: 'Invalid postal code' })
    return
  }

  const data = findVillagesByPostalCode(Number(postalCode))
  if (!data.length) {
    res.status(404).json({ error: `Postal code ${postalCode} not found` })
    return
  }

  res.json({ data })
})

app.get('/postalcode/:villageCode', (req, res) => {
  const code = resolveCode(res, req.params.villageCode, 'Village', findVillage)
  if (code !== null) res.json({ data: readPostalCode(code) })
})

app.get('/full/:villageCode', (req, res) => {
  const code = resolveCode(res, req.params.villageCode, 'Village', findVillage)
  if (code !== null) res.json({ data: getFullDataByVillage(code) })
})

app.get(
  '/full/:provinceCode/:regencyCode/:districtCode/:villageCode',
  (req, res) => {
    const { provinceCode, regencyCode, districtCode, villageCode } = req.params
    const codes = [provinceCode, regencyCode, districtCode, villageCode]
    if (!codes.every(isCode)) {
      res.status(400).json({ error: 'Invalid region code' })
      return
    }

    const data = getFullData(
      Number(provinceCode),
      Number(regencyCode),
      Number(districtCode),
      Number(villageCode)
    )
    if (!data) {
      res.status(404).json({ error: `Region ${codes.join('/')} not found` })
      return
    }

    res.json({ data })
  }
)

app.get('/search', (req, res) => {
  const { q, level, limit = '20' } = req.query
  if (typeof q !== 'string' || q.trim().length < 2) {
    res.status(400).json({ error: 'Query q must be at least 2 characters' })
    return
  }
  if (level !== undefined && !isLevel(level)) {
    res
      .status(400)
      .json({ error: `Invalid level, use one of: ${LEVELS.join(', ')}` })
    return
  }
  if (
    typeof limit !== 'string' ||
    !/^\d+$/.test(limit) ||
    Number(limit) < 1 ||
    Number(limit) > 100
  ) {
    res.status(400).json({ error: 'Invalid limit, use a number from 1 to 100' })
    return
  }

  res.json({ data: searchRegions(q, { level, limit: Number(limit) }) })
})

app.use((_, res) => {
  res.status(404).json({ error: 'Not found' })
})

const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  const errStatus = err?.status ?? err?.statusCode
  const status =
    Number.isInteger(errStatus) && errStatus >= 400 && errStatus < 600
      ? errStatus
      : 500
  if (status >= 500) console.error(err)

  res.set('Cache-Control', 'no-store')
  res.status(status).json({
    error: status < 500 && err.expose ? err.message : STATUS_CODES[status],
  })
}

app.use(errorHandler)

export default app
