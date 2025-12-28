# id-regions-api

API for Indonesian regions. Using data from [Api Wilayah Indonesia](https://github.com/bukanekosoed/Api-Wilayah-Indonesia).

## Endpoints

- `GET /provinces` - Get all provinces
- `GET /regencies/:provinceCode` - Get regencies by province code
- `GET /districts/:regencyCode` - Get districts by regency code
- `GET /villages/:districtCode` - Get villages by district code
- `GET /postalcode/:villageCode` - Get postal code by village code
- `GET /full/:provinceCode/:regencyCode/:districtCode/:villageCode` - Get full data by province code, regency code, district code, and village code

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request
