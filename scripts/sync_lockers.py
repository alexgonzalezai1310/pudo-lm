#!/usr/bin/env python3
"""
Lee Google Sheets y actualiza public/pudo_lockers_geo.json
Uso: python scripts/sync_lockers.py
"""
import json
import re
import urllib.request
import csv
import io
import sys
import os

SHEET_ID = "18QZggXWtaeHGbqKJAiYY4cI3C03Ft7Ga4QZerm1q4UE"
SHEET_URL = f"https://docs.google.com/spreadsheets/d/{SHEET_ID}/export?format=csv"
JSON_PATH = os.path.join(os.path.dirname(__file__), "..", "public", "pudo_lockers_geo.json")


def normalize(s):
    return re.sub(r"\s+", " ", str(s).strip().upper())


def parse_modules(config_str):
    """Cuenta los módulos de una cadena tipo 'A3/A3/TC/D7/D7'."""
    counts = {"TC": 0, "A1": 0, "A3": 0, "D7": 0, "HT12": 0, "BL": 0, "BL_LM": 0}
    if not config_str:
        return counts
    for part in str(config_str).split("/"):
        p = re.sub(r"\s+", " ", part.strip().upper())
        if p in ("BL LM", "BL_LM"):
            counts["BL_LM"] += 1
        elif p in counts:
            counts[p] += 1
    return counts


def fetch_sheet():
    print(f"Leyendo Google Sheets: {SHEET_URL}")
    req = urllib.request.Request(SHEET_URL, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req) as r:
        content = r.read().decode("utf-8")

    reader = csv.reader(io.StringIO(content))
    rows = list(reader)

    # Busca la fila de cabecera
    header_idx = None
    for i, row in enumerate(rows):
        if row and normalize(row[0]) == "NOMBRE DE TIENDA":
            header_idx = i
            break

    if header_idx is None:
        print("ERROR: No se encontró la cabecera 'nombre de tienda' en el Sheet")
        sys.exit(1)

    data = {}
    for row in rows[header_idx + 1:]:
        if not row or not row[0].strip():
            continue
        nombre = row[0].strip()
        config = row[1].strip() if len(row) > 1 else ""
        try:
            cuota = float(row[2].replace(",", ".")) if len(row) > 2 and row[2].strip() else 0.0
        except ValueError:
            cuota = 0.0
        data[normalize(nombre)] = {
            "nombre": nombre,
            "configuracion": config,
            "cuota": cuota,
        }

    print(f"  → {len(data)} lockers leídos del Sheet")
    return data


def main():
    sheet_data = fetch_sheet()

    with open(JSON_PATH, encoding="utf-8") as f:
        stores = json.load(f)

    updated = 0
    not_found = []

    for store in stores:
        for locker in store["lockers"]:
            key = normalize(locker["nombre"])
            if key in sheet_data:
                entry = sheet_data[key]
                locker["configuracion"] = entry["configuracion"]
                locker["mensalidade_eur"] = entry["cuota"]
                modules = parse_modules(entry["configuracion"])
                for k, v in modules.items():
                    locker[k] = v
                updated += 1
            else:
                not_found.append(locker["nombre"])

    with open(JSON_PATH, "w", encoding="utf-8") as f:
        json.dump(stores, f, ensure_ascii=False, indent=2)

    print(f"  → {updated} lockers actualizados en el JSON")
    if not_found:
        print(f"  ⚠ No encontrados en el Sheet: {not_found}")


if __name__ == "__main__":
    main()
