# Synthetic fixtures

All names, messages, provider IDs and products in this directory are synthetic. No provider account is connected and fixture sends use injected transports.

- `catalog.csv` and `catalog.xlsx`: supported snapshot format; stable source ID, decimal price, explicit currency, integer or blank stock. Upload, inspect the mapping, then publish. A replacement uses the existing source ID. `catalog-invalid.csv` demonstrates errors that are never guessed.
- `history.json`: JSON array of `{role:"customer"|"business", text:string}`. CSV uses exactly `role,text` headers. Maximum 500 messages; pairs become draft suggestions only.
- `whatsapp-history.txt`: deliberately supports only `YYYY-MM-DD, HH:mm - Customer: text` followed by `Business: text`. Convert other dialects explicitly. Media and multiline export records are unsupported and reported. Personal detail redaction is only a first pass; review all drafts before publication.
- `messenger.json`, `instagram.json`, `whatsapp.json`: official envelope shapes with isolated fake IDs. Sign raw bytes with HMAC-SHA256 in tests. Verification tokens do not authenticate POST payloads.
- `postgresql.sql`, `mysql.sql`: optional disposable schema fixtures. No database service was created or remotely migrated. Source adapters reject private/local addresses; local database integration testing requires an isolated network fixture adapter, not weakening production SSRF controls.

Catalog images refer to local sample SVG assets. External image URLs are intentionally quarantined; merchant images use the private upload and explicit approval workflow in the Catalog editor. Spreadsheet formulas are never evaluated.

`public/samples/catalog.xlsx` and `fixtures/catalog.xlsx` are real Excel files generated from the downloadable CSV by `node scripts/generate-sample-xlsx.mjs`. They contain the same three synthetic products, explicit BDT prices and a blank unknown-stock cell, with no formulas or macros.
