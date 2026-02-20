from __future__ import annotations

import base64
import binascii
import os
from io import BytesIO
from typing import List, Optional

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from pydantic import BaseModel, Field
from PIL import Image, ImageDraw, ImageFont


def _parse_cors_origins(value: str) -> List[str]:
    """
    CORS_ORIGINS can be:
      - "*"  (allow all; okay for testing)
      - "https://user.github.io,https://example.com"
    """
    v = (value or "").strip()
    if not v:
        return []
    if v == "*":
        return ["*"]
    return [origin.strip() for origin in v.split(",") if origin.strip()]


CORS_ORIGINS = _parse_cors_origins(os.getenv("CORS_ORIGINS", ""))

app = FastAPI(title="Chess Board Classification API", version="1.0.0")

if CORS_ORIGINS:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=CORS_ORIGINS,
        allow_credentials=False,
        allow_methods=["POST", "OPTIONS"],
        allow_headers=["*"],
    )


class BoardClassificationRequest(BaseModel):
    filename: Optional[str] = Field(default=None)
    contentType: str = Field(default="image/png")
    imageBase64: str = Field(..., description="Base64-encoded PNG bytes (may include data: prefix)")


def _decode_base64(s: str) -> bytes:
    # Allow "data:image/png;base64,...."
    raw = (s or "").strip()
    if raw.lower().startswith("data:") and "," in raw:
        raw = raw.split(",", 1)[1]

    try:
        return base64.b64decode(raw, validate=True)
    except (binascii.Error, ValueError) as e:
        raise HTTPException(status_code=400, detail=f"Invalid base64: {e}")


def _ensure_png(png_bytes: bytes) -> Image.Image:
    if len(png_bytes) < 8 or png_bytes[:8] != b"\x89PNG\r\n\x1a\n":
        raise HTTPException(status_code=400, detail="Uploaded bytes are not a PNG file.")

    try:
        img = Image.open(BytesIO(png_bytes))
        img.load()
        return img.convert("RGBA")
    except Exception:
        raise HTTPException(status_code=400, detail="Could not parse PNG image.")


def _process_image(img: Image.Image) -> bytes:
    # Example output transformation (replace with your real board classification visualization)
    border = 16
    w, h = img.size

    out = Image.new("RGBA", (w + border * 2, h + border * 2), (220, 0, 0, 255))
    out.paste(img, (border, border), img)

    draw = ImageDraw.Draw(out)
    font = ImageFont.load_default()
    text = "boardClassification"

    bbox = draw.textbbox((0, 0), text, font=font)
    tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
    pad = 10
    x = out.size[0] - tw - pad
    y = out.size[1] - th - pad

    draw.rectangle([x - 6, y - 4, x + tw + 6, y + th + 4], fill=(0, 0, 0, 140))
    draw.text((x, y), text, font=font, fill=(255, 255, 255, 255))

    buf = BytesIO()
    out.save(buf, format="PNG")
    return buf.getvalue()


@app.post("/boardClassification")
async def board_classification(req: BoardClassificationRequest) -> Response:
    if (req.contentType or "").lower() != "image/png":
        raise HTTPException(status_code=400, detail="contentType must be image/png")

    png_bytes = _decode_base64(req.imageBase64)
    img = _ensure_png(png_bytes)
    out_png = _process_image(img)

    return Response(content=out_png, media_type="image/png", headers={"Cache-Control": "no-store"})


@app.get("/health")
async def health() -> dict:
    return {"ok": True}
