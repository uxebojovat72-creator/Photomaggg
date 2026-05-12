#!/bin/bash
# Import Ашан products from /opt/priceradar-src/ashan/*.json
# Usage: bash scripts/seed-ashan.sh

set -e

PSQL_CMD="docker exec priceradar-postgres psql -U priceradar -d priceradar"
q() { $PSQL_CMD -t -A -c "$1"; }

echo "=== PriceRadar: импорт товаров Ашан ==="

# 1. Get admin user
USER_ID=$(q "SELECT id FROM users WHERE email = 'sarus101@yandex.ru' LIMIT 1")
[ -z "$USER_ID" ] && { echo "Пользователь sarus101@yandex.ru не найден"; exit 1; }
echo "✓ Пользователь: $USER_ID"

# 2. Get Russia country
COUNTRY_ID=$(q "SELECT id FROM countries WHERE code = 'RU' LIMIT 1")
if [ -z "$COUNTRY_ID" ]; then
  COUNTRY_ID=$(q "INSERT INTO countries (id, name, code, flag_emoji) VALUES (gen_random_uuid()::text, 'Россия', 'RU', '🇷🇺') RETURNING id")
fi
echo "✓ Страна: $COUNTRY_ID"

# 3. Get Moscow city
CITY_ID=$(q "SELECT id FROM cities WHERE country_id = '$COUNTRY_ID' AND (name ILIKE 'москва' OR name ILIKE 'moscow') LIMIT 1")
if [ -z "$CITY_ID" ]; then
  CITY_ID=$(q "INSERT INTO cities (id, name, country_id) VALUES (gen_random_uuid()::text, 'Москва', '$COUNTRY_ID') RETURNING id")
fi
echo "✓ Город: $CITY_ID"

# 4. Get or create Ашан store in Moscow
STORE_ID=$(q "SELECT id FROM stores WHERE name = 'Ашан' AND city_id = '$CITY_ID' LIMIT 1")
if [ -z "$STORE_ID" ]; then
  STORE_ID=$(q "INSERT INTO stores (id, name, chain_name, city_id, country_id, created_by, verified) VALUES (gen_random_uuid()::text, 'Ашан', 'Ашан', '$CITY_ID', '$COUNTRY_ID', '$USER_ID', true) RETURNING id")
fi
echo "✓ Магазин Ашан: $STORE_ID"

# 5. Import products via Python
echo ""
echo "Импортирую товары..."

python3 << PYTHON
import json, subprocess, uuid, os
from pathlib import Path

PSQL = ["docker", "exec", "-i", "priceradar-postgres", "psql", "-U", "priceradar", "-d", "priceradar"]
USER_ID = "$USER_ID"
STORE_ID = "$STORE_ID"
ASHAN_DIR = Path("/opt/priceradar-src/ashan")

# Load all JSON files
products = []
for f in sorted(ASHAN_DIR.glob("*.json")):
    try:
        with open(f, encoding="utf-8") as fp:
            data = json.load(fp)
            items = data if isinstance(data, list) else [data]
            products.extend(items)
        print(f"  Файл {f.name}: {len(items)} позиций")
    except Exception as e:
        print(f"  Ошибка в {f.name}: {e}")

print(f"\nВсего: {len(products)} позиций")

# Generate SQL
sql = "BEGIN;\n"
ok = 0
for item in products:
    try:
        name = str(item.get("name", "")).replace("'", "''").strip()
        if not name:
            continue
        brand_raw = item.get("brand", "") or ""
        brand = brand_raw.replace("'", "''").strip()
        brand_sql = f"'{brand}'" if brand and brand != "-" else "NULL"
        price = float(item.get("price", 0))
        if price <= 0:
            continue
        auchan_id = str(item.get("id", ""))
        prod_id = str(uuid.uuid4())
        price_id = str(uuid.uuid4())

        sql += f"""
INSERT INTO products (id, name, brand, barcode, ai_generated, ai_confirmed, created_by, created_at, aliases)
VALUES ('{prod_id}', '{name}', {brand_sql}, '{auchan_id}', false, true, '{USER_ID}', NOW(), ARRAY[]::text[])
ON CONFLICT (barcode) DO NOTHING;

INSERT INTO prices (id, product_id, store_id, user_id, price, currency_code, status, created_at)
SELECT '{price_id}', id, '{STORE_ID}', '{USER_ID}', {price}, 'RUB', 'approved', NOW()
FROM products WHERE barcode = '{auchan_id}'
ON CONFLICT DO NOTHING;
"""
        ok += 1
    except Exception as e:
        print(f"  Пропуск {item.get('name','?')}: {e}")

sql += "COMMIT;\n"

# Run SQL
proc = subprocess.run(PSQL, input=sql, capture_output=True, text=True)
errors = [l for l in proc.stderr.splitlines() if "ERROR" in l]
if errors:
    print("Ошибки:")
    for e in errors[:10]:
        print(" ", e)
else:
    print(f"\n✓ Успешно импортировано: {ok} товаров из Ашана в базу данных!")
PYTHON
