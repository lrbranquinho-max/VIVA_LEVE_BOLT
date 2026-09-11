from __future__ import annotations

import io
import json
import re
import unicodedata
import urllib.parse
import urllib.request
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "outputs" / "product-image-validation"
BUCKET = "produtos-viva-leve"
PREFIX = "produtos/versionados"


def env_local() -> dict[str, str]:
    values: dict[str, str] = {}
    for line in (ROOT / ".env.local").read_text(encoding="utf-8").splitlines():
        if not line or line.lstrip().startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        values[key.strip()] = value.strip().strip('"').strip("'")
    return values


def request_json(url: str, key: str, method: str = "GET", body: object | None = None):
    payload = None if body is None else json.dumps(body).encode("utf-8")
    request = urllib.request.Request(
        url,
        data=payload,
        method=method,
        headers={"apikey": key, "Authorization": f"Bearer {key}", "Content-Type": "application/json"},
    )
    with urllib.request.urlopen(request, timeout=60) as response:
        return json.load(response)


def download(url: str) -> bytes:
    with urllib.request.urlopen(url, timeout=60) as response:
        if response.status != 200:
            raise RuntimeError(f"HTTP {response.status}: {url}")
        return response.read()


def slug(value: str) -> str:
    normalized = unicodedata.normalize("NFD", value)
    ascii_value = "".join(char for char in normalized if unicodedata.category(char) != "Mn")
    compact = re.sub(r"[^a-z0-9]+", "-", ascii_value.lower()).strip("-")[:72]
    return compact or "produto"


def public_url(base_url: str, path: str) -> str:
    encoded = "/".join(urllib.parse.quote(part, safe="") for part in path.split("/"))
    return f"{base_url}/storage/v1/object/public/{BUCKET}/{encoded}"


def preview(image_bytes: bytes, size: tuple[int, int]) -> Image.Image:
    with Image.open(io.BytesIO(image_bytes)) as source:
        source.load()
        converted = source.convert("RGB")
        converted.thumbnail(size, Image.Resampling.LANCZOS)
        canvas = Image.new("RGB", size, "white")
        canvas.paste(converted, ((size[0] - converted.width) // 2, (size[1] - converted.height) // 2))
        return canvas


def main() -> None:
    settings = env_local()
    base_url = settings["NEXT_PUBLIC_SUPABASE_URL"].rstrip("/")
    key = settings["NEXT_PUBLIC_SUPABASE_ANON_KEY"]
    product_query = urllib.parse.urlencode({
        "select": "id,nome,imagem_url",
        "ativo": "eq.true",
        "imagem_url": "not.is.null",
        "order": "id.asc",
    })
    products = request_json(f"{base_url}/rest/v1/produtos?{product_query}", key)
    objects = []
    for offset in range(0, 1000, 100):
        page = request_json(
            f"{base_url}/storage/v1/object/list/{BUCKET}",
            key,
            method="POST",
            body={"prefix": PREFIX, "limit": 100, "offset": offset, "sortBy": {"column": "name", "order": "asc"}},
        )
        objects.extend(page)
        if len(page) < 100:
            break
    names = [str(item["name"]) for item in objects if item.get("name")]
    OUTPUT.mkdir(parents=True, exist_ok=True)

    font = ImageFont.load_default()
    row_height = 210
    sheet = Image.new("RGB", (930, 40 + row_height * len(products)), "#f4f4f5")
    draw = ImageDraw.Draw(sheet)
    draw.text((10, 10), "ORIGINAL | THUMB 480 WEBP | DETALHE 1200 WEBP", fill="black", font=font)
    report: list[dict[str, object]] = []

    for index, product in enumerate(products):
        product_slug = slug(str(product["nome"]))
        thumb_name = next((name for name in names if name.startswith(product_slug + "-") and name.endswith("-v2-thumb-480.webp")), None)
        detail_name = next((name for name in names if name.startswith(product_slug + "-") and name.endswith("-v2-detail-1200.webp")), None)
        if not thumb_name or not detail_name:
            raise RuntimeError(f"Variantes ausentes para produto {product['id']}: {product['nome']}")

        thumb_url = public_url(base_url, f"{PREFIX}/{thumb_name}")
        detail_url = public_url(base_url, f"{PREFIX}/{detail_name}")
        original_bytes, thumb_bytes, detail_bytes = (
            download(str(product["imagem_url"])), download(thumb_url), download(detail_url)
        )
        images = []
        dimensions = []
        for raw in (original_bytes, thumb_bytes, detail_bytes):
            with Image.open(io.BytesIO(raw)) as parsed:
                parsed.verify()
            with Image.open(io.BytesIO(raw)) as parsed:
                dimensions.append([parsed.width, parsed.height, parsed.format])
            images.append(preview(raw, (290, 170)))

        y = 40 + index * row_height
        for column, image in enumerate(images):
            sheet.paste(image, (10 + column * 305, y))
        draw.text((10, y + 174), f"#{product['id']} {str(product['nome'])[:105]}", fill="black", font=font)
        report.append({
            "produto_id": product["id"], "nome": product["nome"],
            "original_bytes": len(original_bytes), "thumbnail_bytes": len(thumb_bytes), "detalhe_bytes": len(detail_bytes),
            "dimensions": dimensions, "thumbnail_url": thumb_url, "detalhe_url": detail_url,
        })

    sheet.save(OUTPUT / "comparacao-catalogo.webp", "WEBP", quality=88, method=6)
    (OUTPUT / "validation.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({
        "products": len(report),
        "total_original_bytes": sum(int(item["original_bytes"]) for item in report),
        "total_thumbnail_bytes": sum(int(item["thumbnail_bytes"]) for item in report),
        "total_detail_bytes": sum(int(item["detalhe_bytes"]) for item in report),
        "invalid_dimensions": sum(1 for item in report if item["dimensions"][1][0] > 480 or item["dimensions"][1][1] > 480 or item["dimensions"][2][0] > 1200 or item["dimensions"][2][1] > 1200),
        "contact_sheet": str(OUTPUT / "comparacao-catalogo.webp"),
    }, ensure_ascii=False))


if __name__ == "__main__":
    main()
