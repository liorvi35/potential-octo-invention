from __future__ import annotations

import base64
import binascii
from io import BytesIO
from typing import Optional

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from pydantic import BaseModel, Field
from PIL import Image, ImageDraw, ImageFont


app = FastAPI(title="Chess Board Classification API", version="1.0.0")

# If your frontend is on GitHub Pages, set this to your Pages origin.
# For quick testing you can use ["*"], but tighten it for production.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["POST", "OPTIONS"],
    allow_headers=["*"],
)


class BoardClassificationRequest(BaseModel):
    filename: Optional[str] = Field(default=None, description="Original filename (optional)")
    contentType: str = Field(default="image/png", description="Expected: image/png")
    imageBase64: str = Field(..., description="Base64-encoded PNG bytes (no data: prefix)")


def _decode_base64(s: str) -> bytes:
    # Allow accidental "data:image/png;base64,...." prefixes
    if "," in s and s.strip().lower().startswith("data:"):
        s = s.split(",", 1)[1]

    try:
        return base64.b64decode(s, validate=True)
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
    # Example "output image": add border + watermark (replace with your model later)
    border = 16
    w, h = img.size

    out = Image.new("RGBA", (w + border * 2, h + border * 2), (220, 0, 0, 255))
    out.paste(img, (border, border), img)

    draw = ImageDraw.Draw(out)
    font = ImageFont.load_default()
    text = "boardClassification"

    # place watermark bottom-right
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
    if req.contentType.lower() != "image/png":
        raise HTTPException(status_code=400, detail="contentType must be image/png")

    png_bytes = _decode_base64(req.imageBase64)
    img = _ensure_png(png_bytes)
    out_png = _process_image(img)

    return Response(content=out_png, media_type="image/png", headers={"Cache-Control": "no-store"})


@app.get("/health")
async def health() -> dict:
    return {"ok": True}
  
