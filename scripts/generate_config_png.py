#!/usr/bin/env python3
"""
Genera montajes PNG de configuración para lockers que aún no tienen imagen.
Compone los renders base (TC, A1, A3, D7, BL, JL) horizontalmente.
Uso: python scripts/generate_config_png.py [--force]
"""
import json
import re
import sys
import os
from pathlib import Path

try:
    from PIL import Image
except ImportError:
    print("ERROR: Pillow no instalado. Ejecuta: pip install pillow")
    sys.exit(1)

RENDERS_DIR = Path(__file__).parent.parent / "public" / "module_renders"
CONFIGS_DIR = Path(__file__).parent.parent / "public" / "locker_configs"
JSON_PATH = Path(__file__).parent.parent / "public" / "pudo_lockers_geo.json"

TARGET_HEIGHT = 900

KNOWN_MODULES = {"TC", "A1", "A3", "D7", "HT12", "BL", "JL", "BL_LM"}


def parse_config(config_str):
    """Convierte 'A3/A3/TC/D7/JL' en lista de nombres de módulo."""
    modules = []
    for part in str(config_str).split("/"):
        p = re.sub(r"\s+", " ", part.strip().upper())
        if p in ("BL LM", "BL_LM"):
            modules.append("JL")  # BL LM era el nombre antiguo de Jaula (JL)
        elif p in KNOWN_MODULES:
            modules.append(p)
    return modules


def scale_to_height(img, height):
    w, h = img.size
    new_w = round(w * height / h)
    return img.resize((new_w, height), Image.LANCZOS)


def generate_montage(modules):
    images = []
    for mod in modules:
        render_name = f"{mod}.png"
        render_path = RENDERS_DIR / render_name
        if not render_path.exists():
            print(f"  ⚠ Sin render para módulo {mod}, omitido")
            continue
        img = Image.open(render_path).convert("RGBA")
        images.append(scale_to_height(img, TARGET_HEIGHT))

    if not images:
        return None

    total_w = sum(img.width for img in images)
    canvas = Image.new("RGBA", (total_w, TARGET_HEIGHT), (0, 0, 0, 0))
    x = 0
    for img in images:
        canvas.paste(img, (x, 0), img)
        x += img.width
    return canvas


def slug(name):
    s = re.sub(r"\s+", "_", name.strip().upper())
    s = re.sub(r"[^A-Z0-9_]", "", s)
    return s


def main():
    force = "--force" in sys.argv

    with open(JSON_PATH, encoding="utf-8") as f:
        stores = json.load(f)

    generated = 0
    skipped = 0
    updated_json = False

    for store in stores:
        for locker in store["lockers"]:
            config = locker.get("configuracion", "").strip()
            if not config:
                continue

            config_file = locker.get("config_file", "")
            if config_file:
                out_path = CONFIGS_DIR / config_file
                if out_path.exists() and not force:
                    skipped += 1
                    continue
            else:
                fname = f"{slug(locker['nombre'])}_config.png"
                out_path = CONFIGS_DIR / fname
                locker["config_file"] = fname
                updated_json = True

            modules = parse_config(config)
            if not modules:
                print(f"  ⚠ Config sin módulos válidos: {config!r} ({locker['nombre']})")
                continue

            montage = generate_montage(modules)
            if montage:
                CONFIGS_DIR.mkdir(exist_ok=True)
                montage.save(str(out_path), "PNG")
                print(f"  ✓ Generado: {out_path.name} ({len(modules)} módulos)")
                generated += 1

    if updated_json or generated > 0:
        with open(JSON_PATH, "w", encoding="utf-8") as f:
            json.dump(stores, f, ensure_ascii=False, indent=2)

    print(f"\n→ {generated} PNGs generados, {skipped} omitidos (ya existen)")


if __name__ == "__main__":
    main()
