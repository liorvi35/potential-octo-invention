from __future__ import annotations

from functools import lru_cache
from io import BytesIO
from typing import Any
import os
from pathlib import Path

import numpy as np
import torch
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from PIL import Image


MODEL_PATH: Path = Path("./convnext_new_data.pth")
BOARD_SIZE: int = 8
MODEL_INPUT_SIZE: int = 224
IMAGENET_MEAN: torch.tensor = torch.tensor([0.485, 0.456, 0.406], dtype=torch.float32).view(3, 1, 1)
IMAGENET_STD: torch.tensor = torch.tensor([0.229, 0.224, 0.225], dtype=torch.float32).view(3, 1, 1)

IDX_TO_FEN = {
    0: "P", 1: "R", 2: "N", 3: "B", 4: "Q", 5: "K",
    6: "p", 7: "r", 8: "n", 9: "b", 10: "q", 11: "k",
    12: "1",
}
IDX_TO_UNICODE = {
    0: "♙", 1: "♖", 2: "♘", 3: "♗", 4: "♕", 5: "♔",
    6: "♟", 7: "♜", 8: "♞", 9: "♝", 10: "♛", 11: "♚",
    12: "",
}
IDX_TO_NAME = {
    0: "white_pawn", 1: "white_rook", 2: "white_knight", 3: "white_bishop", 4: "white_queen", 5: "white_king",
    6: "black_pawn", 7: "black_rook", 8: "black_knight", 9: "black_bishop", 10: "black_queen", 11: "black_king",
    12: "empty",
}

app = FastAPI(title="Chess Board Classification API", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


def get_device() -> str:
    return "cuda" if torch.cuda.is_available() else "cpu"


@lru_cache(maxsize=1)
def load_model() -> torch.nn.Module:
    try:
        model = torch.load(MODEL_PATH, map_location=get_device(), weights_only=False)
    except FileNotFoundError as exc:
        raise RuntimeError(f"Model file was not found at {MODEL_PATH}") from exc
    except Exception as exc:
        raise RuntimeError(f"Could not load model from {MODEL_PATH}: {exc}") from exc

    if not hasattr(model, "eval"):
        raise RuntimeError("Loaded object is not a PyTorch model.")

    model = model.to(get_device())
    model.eval()
    return model


def read_upload_as_pil(file_bytes: bytes) -> Image.Image:
    try:
        image = Image.open(BytesIO(file_bytes))
        image.load()
        return image.convert("RGB")
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Invalid image file: {exc}") from exc



def center_crop_to_square(image: Image.Image) -> Image.Image:
    width, height = image.size
    side = min(width, height)
    left = (width - side) // 2
    top = (height - side) // 2
    return image.crop((left, top, left + side, top + side))



def split_board_into_cells(image: Image.Image) -> list[Image.Image]:
    square = center_crop_to_square(image)
    size = square.size[0]
    cells: list[Image.Image] = []

    for row in range(BOARD_SIZE):
        for col in range(BOARD_SIZE):
            left = round(col * size / BOARD_SIZE)
            right = round((col + 1) * size / BOARD_SIZE)
            top = round(row * size / BOARD_SIZE)
            bottom = round((row + 1) * size / BOARD_SIZE)
            cells.append(square.crop((left, top, right, bottom)))

    return cells



def cell_to_tensor(cell: Image.Image) -> torch.Tensor:
    resized = cell.resize((MODEL_INPUT_SIZE, MODEL_INPUT_SIZE), Image.Resampling.BILINEAR)
    arr = np.asarray(resized, dtype=np.float32) / 255.0
    tensor = torch.from_numpy(arr).permute(2, 0, 1)
    tensor = (tensor - IMAGENET_MEAN) / IMAGENET_STD
    return tensor



def classify_cells(model: torch.nn.Module, cells: list[Image.Image]) -> list[int]:
    batch = torch.stack([cell_to_tensor(cell) for cell in cells]).to(get_device())

    with torch.inference_mode():
        outputs = model(batch)
        if isinstance(outputs, dict):
            if "logits" in outputs:
                outputs = outputs["logits"]
            else:
                outputs = next(iter(outputs.values()))
        elif isinstance(outputs, (tuple, list)):
            outputs = outputs[0]

        if not isinstance(outputs, torch.Tensor):
            raise RuntimeError("Model output is not a tensor.")

        predictions = torch.argmax(outputs, dim=1)

    return predictions.detach().cpu().tolist()



def reshape_board(flat_values: list[int]) -> list[list[int]]:
    return [flat_values[i * BOARD_SIZE:(i + 1) * BOARD_SIZE] for i in range(BOARD_SIZE)]



def board_to_unicode(board: list[list[int]]) -> list[list[str]]:
    return [[IDX_TO_UNICODE.get(value, "") for value in row] for row in board]



def board_to_names(board: list[list[int]]) -> list[list[str]]:
    return [[IDX_TO_NAME.get(value, f"unknown_{value}") for value in row] for row in board]



def board_to_fen(board: list[list[int]]) -> str:
    fen_rows: list[str] = []
    for row in board:
        parts: list[str] = []
        empty_run = 0
        for value in row:
            fen_char = IDX_TO_FEN.get(value, "1")
            if fen_char == "1":
                empty_run += 1
            else:
                if empty_run:
                    parts.append(str(empty_run))
                    empty_run = 0
                parts.append(fen_char)
        if empty_run:
            parts.append(str(empty_run))
        fen_rows.append("".join(parts) or "8")
    return "/".join(fen_rows)



def count_pieces(board: list[list[int]]) -> dict[str, int]:
    counts: dict[str, int] = {}
    for row in board:
        for value in row:
            name = IDX_TO_NAME.get(value, f"unknown_{value}")
            counts[name] = counts.get(name, 0) + 1
    return counts



def classify_board_image(image: Image.Image) -> dict[str, Any]:
    model = load_model()
    cells = split_board_into_cells(image)
    flat_predictions = classify_cells(model, cells)
    board = reshape_board(flat_predictions)

    return {
        "board": board,
        "fen": board_to_fen(board),
        "unicodeBoard": board_to_unicode(board),
        "nameBoard": board_to_names(board),
        "pieceCounts": count_pieces(board),
        "modelPath": MODEL_PATH,
        "device": get_device(),
        "note": "This simple backend assumes the uploaded image already contains one chessboard centered in the frame.",
    }


@app.get("/health")
def health() -> dict[str, bool]:
    return {"ok": True}


@app.post("/boardClassification")
async def board_classification(file: UploadFile = File(...)) -> dict[str, Any]:
    if not file.filename:
        raise HTTPException(status_code=400, detail="No file was uploaded.")

    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="Uploaded file is empty.")

    image = read_upload_as_pil(content)

    try:
        result = classify_board_image(image)
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Classification failed: {exc}") from exc

    result["filename"] = file.filename
    result["contentType"] = file.content_type or "application/octet-stream"
    return result
