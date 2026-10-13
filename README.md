# id-regions-api

API for Indonesian regions. Using data from [Api Wilayah Indonesia](https://github.com/bukanekosoed/Api-Wilayah-Indonesia).

## Endpoints

- `GET /provinces` - Get all provinces
- `GET /regencies/:provinceCode` - Get regencies by province code
- `GET /districts/:regencyCode` - Get districts by regency code
- `GET /villages/:districtCode` - Get villages by district code
- `GET /postalcode/:villageCode` - Get postal code by village code
- `GET /full/:provinceCode/:regencyCode/:districtCode/:villageCode` - Get full data by province code, regency code, district code, and village code

Codes are numeric: provinces have 2 digits (`11`), regencies 4 (`1101`), districts 6 (`110101`) and villages 10 (`1101012002`).

### Responses

Successful responses wrap the result in `data`:

```http
GET /full/11/1101/110101/1101012002
```

```json
{
  "data": {
    "province": { "code": 11, "name": "Aceh (NAD)" },
    "regency": { "code": 1101, "name": "Aceh Selatan" },
    "district": { "code": 110101, "name": "Bakongan" },
    "village": { "code": 1101012002, "name": "Ujong Mangki (Ujung Mangki)" },
    "postalCode": 23773
  }
}
```

`/postalcode/:villageCode` returns `{ "data": null }` when the village has no postal code in the dataset.

Errors return an `error` message:

- `400` - the code is not a number, e.g. `/regencies/abc`
- `404` - the region does not exist, or the `/full` codes do not belong to each other

```json
{ "error": "Province 99 not found" }
```

## Development

Requires [Bun](https://bun.sh).

```sh
bun install
bun run dev                   # start on http://localhost:3000 and restart on changes
bun run start                 # start without watching, PORT overrides the port
bun test                      # run the tests
bun run typecheck             # type-check with tsc
bun run data:refresh          # check the source datasets for postal code and name fixes
bun run data:refresh --write  # apply them to src/data
```

## Data notes

- 97.6% of villages have a postal code. 2,026 villages are still missing one because no trusted source could confirm it.
- Missing postal codes, 27 wrong ones and 16 truncated names were filled in from [cahyadsn/wilayah_kodepos](https://github.com/cahyadsn/wilayah_kodepos) and [cahyadsn/wilayah](https://github.com/cahyadsn/wilayah) (Kemendagri codes, MIT License). See [src/data/NOTICE.md](src/data/NOTICE.md).
- `bun run data:refresh` re-runs that process against the latest source datasets. A value is only used when both Kepmendagri versions agree and the village name matches, or when [erlange/Kodepos-Wilayah-Indonesia](https://github.com/erlange/Kodepos-Wilayah-Indonesia) independently confirms it.
- To refresh without a local setup, run the **Refresh data** workflow from the Actions tab. It opens a pull request only when the sources have something new, and shows the report on the run page either way. GitHub must be allowed to open pull requests from Actions: Settings → Actions → General → Workflow permissions → *Allow GitHub Actions to create and approve pull requests*.

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request
