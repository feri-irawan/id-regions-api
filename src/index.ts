import express from 'express'
import {
  readProvinces,
  readRegencies,
  readDistricts,
  readVillages,
  readPostalCode,
  getFullData,
} from './lib/reader'
import cors from 'cors'

const app = express()

app.use(cors())

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
  res.json({
    data: readRegencies(Number(req.params.provinceCode)),
  })
})

app.get('/districts/:regencyCode', (req, res) => {
  res.json({
    data: readDistricts(Number(req.params.regencyCode)),
  })
})

app.get('/villages/:districtCode', (req, res) => {
  res.json({
    data: readVillages(Number(req.params.districtCode)),
  })
})

app.get('/postalcode/:villageCode', (req, res) => {
  res.json({
    data: readPostalCode(Number(req.params.villageCode)),
  })
})

app.get(
  '/full/:provinceCode/:regencyCode/:districtCode/:villageCode',
  (req, res) => {
    res.json({
      data: getFullData(
        Number(req.params.provinceCode),
        Number(req.params.regencyCode),
        Number(req.params.districtCode),
        Number(req.params.villageCode)
      ),
    })
  }
)

if (process.env.NODE_ENV === 'development') {
  app.listen(3000, () => console.log(`Server running on port ${3000}`))
}

export default app
