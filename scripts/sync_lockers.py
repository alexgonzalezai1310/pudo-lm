#!/usr/bin/env python3
"""
Lee Google Sheets y actualiza public/pudo_lockers_geo.json

- Lockers existentes: actualiza configuracion, cuota mensual y conteo de módulos
- Lockers nuevos: geocodifica con Google Maps Places API y crea la entrada completa

Uso: python scripts/sync_lockers.py
Requiere: variable de entorno GOOGLE_MAPS_API_KEY (solo para lockers nuevos)
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

# Palabras que indican sufijo en el nombre del locker (no forman parte de la ciudad)
SUFFIX_WORDS = {"EXTERIOR", "PALETS", "PALET", "COMPACT", "NUEVO", "GRANDE"}


def normalize(s):
    return re.sub(r"\s+", " ", str(s).strip().upper())


def parse_modules(config_str):
    """Cuenta los módulos de una cadena tipo 'A3/A3/TC/D7/JL'."""
    counts = {"TC": 0, "A1": 0, "A3": 0, "D7": 0, "HT12": 0, "BL": 0, "BL_LM": 0, "JL": 0}
    if not config_str:
        return counts
    for part in str(config_str).split("/"):
        p = re.sub(r"\s+", " ", part.strip().upper())
        if p in ("BL LM", "BL_LM"):
            counts["BL_LM"] += 1
        elif p in counts:
            counts[p] += 1
    return counts


def extract_city(locker_name):
    """
    Extrae la ciudad del nombre del locker.
    'LM ALTA DE LISBOA EXTERIOR' → 'ALTA DE LISBOA'
    'LM VIANA DO CASTELO PALETS' → 'VIANA DO CASTELO'
    """
    name = re.sub(r"^LM\s+", "", locker_name.strip().upper())
    city_words = []
    for word in name.split():
        clean = re.sub(r"[()_]", "", word)
        if clean in SUFFIX_WORDS or (len(clean) == 1 and clean.isalpha()):
            break
        city_words.append(clean)
    return " ".join(city_words)


def slug_locker(nombre):
    """'LM ALTA DE LISBOA EXTERIOR' → 'LM_ALTA_DE_LISBOA_EXTERIOR'"""
    s = re.sub(r"\s+", "_", nombre.strip().upper())
    return re.sub(r"[^A-Z0-9_]", "", s)


def geocode_leroy_merlin(city, api_key):
    """
    Busca 'Leroy Merlin CITY Portugal' usando Places API (New) Text Search.
    Devuelve dict con lat, lng, direccion, ciudad, codigo_postal o None si falla.
    """
    query = f"Leroy Merlin {city} Portugal"
    url = "https://places.googleapis.com/v1/places:searchText"

    payload = json.dumps({"textQuery": query, "languageCode": "pt"}).encode("utf-8")
    headers = {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": api_key,
        "X-Goog-FieldMask": "places.displayName,places.formattedAddress,places.location",
    }

    req = urllib.request.Request(url, data=payload, headers=headers, method="POST")
    with urllib.request.urlopen(req) as r:
        data = json.loads(r.read().decode("utf-8"))

    places = data.get("places", [])
    if not places:
        print(f"  ⚠ Places API sin resultados para '{query}'")
        return None

    result = places[0]
    lat = result["location"]["latitude"]
    lng = result["location"]["longitude"]
    address = result.get("formattedAddress", "")

    cp_match = re.search(r"(\d{4}-\d{3})\s+([^,]+)", address)
    ciudad = cp_match.group(2).strip() if cp_match else city.title()
    cp = cp_match.group(1) if cp_match else ""
    calle = address.split(",")[0].strip() if "," in address else address

    return {"lat": lat, "lng": lng, "direccion": calle, "ciudad": ciudad, "codigo_postal": cp}


def next_numero(stores):
    nums = [l["numero"] for s in stores for l in s["lockers"] if l.get("numero")]
    return max(nums, default=0) + 1


def find_or_create_store(stores, city, geo):
    """Busca tienda por ciudad (case-insensitive) o crea una nueva."""
    city_up = city.upper()
    for store in stores:
        if store.get("ciudad", "").upper() == city_up:
            return store
    # Tienda nueva
    new_store = {
        "id": f"LM {city_up}",
        "tienda_oficial": f"LEROY MERLIN {city.title()}",
        "direccion": geo.get("direccion", ""),
        "ciudad": geo.get("ciudad", city.title()),
        "codigo_postal": geo.get("codigo_postal", ""),
        "lat": geo["lat"],
        "lng": geo["lng"],
        "lockers": [],
    }
    stores.append(new_store)
    print(f"  + Tienda nueva: {new_store['tienda_oficial']} ({geo['lat']:.6f}, {geo['lng']:.6f})")
    return new_store


def fetch_sheet():
    print(f"Leyendo Google Sheets: {SHEET_URL}")
    req = urllib.request.Request(SHEET_URL, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req) as r:
        content = r.read().decode("utf-8")

    reader = csv.reader(io.StringIO(content))
    rows = list(reader)

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
        data[normalize(nombre)] = {"nombre": nombre, "configuracion": config, "cuota": cuota}

    print(f"  → {len(data)} lockers leídos del Sheet")
    return data


def main():
    sheet_data = fetch_sheet()

    with open(JSON_PATH, encoding="utf-8") as f:
        stores = json.load(f)

    # Mapa nombre normalizado → locker object
    locker_map = {}
    for store in stores:
        for locker in store["lockers"]:
            locker_map[normalize(locker["nombre"])] = locker

    api_key = os.environ.get("GOOGLE_MAPS_API_KEY", "")

    updated = 0
    added = 0
    pending_geocode = []  # nuevos sin API key

    for key, entry in sheet_data.items():
        if key in locker_map:
            # Actualizar locker existente
            locker = locker_map[key]
            locker["configuracion"] = entry["configuracion"]
            locker["mensalidade_eur"] = entry["cuota"]
            modules = parse_modules(entry["configuracion"])
            locker.update(modules)
            updated += 1
        else:
            # Locker nuevo
            if not api_key:
                pending_geocode.append(entry["nombre"])
                continue

            nombre = entry["nombre"]
            city = extract_city(nombre)
            print(f"  Nuevo locker: '{nombre}' → buscando ciudad '{city}'...")

            geo = geocode_leroy_merlin(city, api_key)
            if not geo:
                pending_geocode.append(nombre)
                continue

            print(f"    → {geo['lat']:.6f}, {geo['lng']:.6f}")

            numero = next_numero(stores)
            modules = parse_modules(entry["configuracion"])
            fname = f"{numero:02d}_{slug_locker(nombre)}.png"

            new_locker = {
                "nombre": nombre,
                "numero": numero,
                "configuracion": entry["configuracion"],
                "mensalidade_eur": entry["cuota"],
                **modules,
                "photo_file": "",
                "config_file": fname,
            }

            store = find_or_create_store(stores, city, geo)
            store["lockers"].append(new_locker)
            locker_map[key] = new_locker
            added += 1

    with open(JSON_PATH, "w", encoding="utf-8") as f:
        json.dump(stores, f, ensure_ascii=False, indent=2)

    print(f"  → {updated} actualizados, {added} nuevos añadidos")
    if pending_geocode:
        label = "sin GOOGLE_MAPS_API_KEY" if not api_key else "no geocodificados"
        print(f"  ⚠ Pendientes ({label}): {pending_geocode}")


if __name__ == "__main__":
    main()
