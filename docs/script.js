const API_ORIGIN = window.CHESS_API_ORIGIN || "http://127.0.0.1:8000";
const HEALTH_ENDPOINT = `${API_ORIGIN}/health`;
const CLASSIFY_ENDPOINT = `${API_ORIGIN}/boardClassification`;
const TEST_SAMPLES_DIR = "./test_samples/";
const TEST_SAMPLES_MANIFEST = `${TEST_SAMPLES_DIR}manifest.json`;

const FILE_VALUE_TO_NAME = {
  0: "white_pawn",
  1: "white_rook",
  2: "white_knight",
  3: "white_bishop",
  4: "white_queen",
  5: "white_king",
  6: "black_pawn",
  7: "black_rook",
  8: "black_knight",
  9: "black_bishop",
  10: "black_queen",
  11: "black_king",
  12: "empty"
};

const FILE_VALUE_TO_UNICODE = {
  0: "♙",
  1: "♖",
  2: "♘",
  3: "♗",
  4: "♕",
  5: "♔",
  6: "♟",
  7: "♜",
  8: "♞",
  9: "♝",
  10: "♛",
  11: "♚",
  12: ""
};

const IMAGE_EXTENSIONS = /\.(png|jpe?g|webp|bmp|gif)$/i;

const pingBtn = document.getElementById("pingBtn");
const testBtn = document.getElementById("testBtn");
const sendBtn = document.getElementById("sendBtn");
const clearBtn = document.getElementById("clearBtn");
const fileInput = document.getElementById("fileInput");
const filePicker = document.querySelector("label.file-picker");

const statusEl = document.getElementById("status");
const inputBadge = document.getElementById("inputBadge");
const resultBadge = document.getElementById("resultBadge");
const inputPreview = document.getElementById("inputPreview");
const inputPlaceholder = document.getElementById("inputPlaceholder");
const inputMeta = document.getElementById("inputMeta");

const resultPlaceholder = document.getElementById("resultPlaceholder");
const resultContent = document.getElementById("resultContent");
const resultMessage = document.getElementById("resultMessage");
const loadingWrap = document.getElementById("loadingWrap");
const boardGrid = document.getElementById("boardGrid");
const boardJson = document.getElementById("boardJson");
const copyBoardBtn = document.getElementById("copyBoardBtn");
const copyFenBtn = document.getElementById("copyFenBtn");
const pieceCounts = document.getElementById("pieceCounts");
const fenValue = document.getElementById("fenValue");

let selectedFile = null;
let inputObjectUrl = null;
let backendReady = false;

const setBackendReady = (ready) => {
  backendReady = Boolean(ready);
  fileInput.disabled = !backendReady;
  if (filePicker) {
    filePicker.classList.toggle("disabled", !backendReady);
    filePicker.setAttribute("aria-disabled", String(!backendReady));
  }
  updateButtons();
};

const setStatus = (message, kind = "") => {
  statusEl.textContent = message;
  statusEl.className = `status${kind ? ` ${kind}` : ""}`;
};

const setInputBadge = (text) => {
  inputBadge.textContent = text;
};

const setResultBadge = (text) => {
  resultBadge.textContent = text;
};

const resetPreview = () => {
  if (inputObjectUrl) {
    URL.revokeObjectURL(inputObjectUrl);
    inputObjectUrl = null;
  }

  inputPreview.removeAttribute("src");
  inputPreview.style.display = "none";
  inputPlaceholder.style.display = "grid";
  inputMeta.innerHTML = "";
  setInputBadge("No file selected");
};

const resetResult = () => {
  boardGrid.innerHTML = "";
  boardJson.textContent = "";
  pieceCounts.innerHTML = "";
  fenValue.textContent = "";
  resultContent.classList.add("hidden");
  resultPlaceholder.classList.remove("hidden");
  setLoading(false);
  setResultBadge("Waiting");
};

const setLoading = (isLoading) => {
  const loading = Boolean(isLoading);

  if (loadingWrap) {
    loadingWrap.classList.toggle("hidden", !loading);
    loadingWrap.setAttribute("aria-busy", String(loading));
  }

  if (resultMessage) {
    resultMessage.classList.toggle("hidden", loading);
  }

  if (loading) {
    resultContent.classList.add("hidden");
    resultPlaceholder.classList.remove("hidden");
  }
};

const updateButtons = () => {
  const hasFile = Boolean(selectedFile);
  sendBtn.disabled = !(backendReady && hasFile);
  clearBtn.disabled = !hasFile;
  if (testBtn) {
    testBtn.disabled = !backendReady;
  }
};

const formatBytes = (bytes) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
};

const escapeHtml = (value) => String(value)
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#39;");

const copyToClipboard = async (text) => {
  if (!text) return false;

  if (navigator.clipboard && window.isSecureContext) {
    await navigator.clipboard.writeText(text);
    return true;
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  textarea.style.top = "-9999px";
  document.body.appendChild(textarea);
  textarea.select();
  const ok = document.execCommand("copy");
  document.body.removeChild(textarea);
  return ok;
};

const flashCopyState = (btn) => {
  if (!btn) return;
  const prev = btn.textContent;
  btn.textContent = "✓";
  btn.classList.add("copied");
  window.setTimeout(() => {
    btn.textContent = prev;
    btn.classList.remove("copied");
  }, 900);
};

const showPreview = (file, sourceLabel = "Local file") => {
  resetPreview();
  inputObjectUrl = URL.createObjectURL(file);
  inputPreview.src = inputObjectUrl;
  inputPreview.style.display = "block";
  inputPlaceholder.style.display = "none";
  inputMeta.innerHTML = `
    <div><strong>Name:</strong> ${escapeHtml(file.name)}</div>
    <div><strong>Type:</strong> ${escapeHtml(file.type || "unknown")}</div>
    <div><strong>Size:</strong> ${escapeHtml(formatBytes(file.size || 0))}</div>
    <div><strong>Source:</strong> ${escapeHtml(sourceLabel)}</div>
  `;
  setInputBadge(file.name);
};

const normalizeSampleUrl = (value) => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.startsWith("#") || trimmed.startsWith("?")) return null;
  if (!IMAGE_EXTENSIONS.test(trimmed)) return null;
  return new URL(trimmed, new URL(TEST_SAMPLES_DIR, window.location.href)).href;
};

const fetchTestSampleUrls = async () => {
  try {
    const manifestResponse = await fetch(TEST_SAMPLES_MANIFEST, { cache: "no-store" });
    if (manifestResponse.ok) {
      const manifest = await manifestResponse.json();
      const rawFiles = Array.isArray(manifest)
        ? manifest
        : Array.isArray(manifest?.files)
          ? manifest.files
          : [];
      const urls = rawFiles
        .map(normalizeSampleUrl)
        .filter(Boolean);
      if (urls.length) {
        return urls;
      }
    }
  } catch (error) {
    // ignore manifest failures and try directory listing fallback
  }

  const listingResponse = await fetch(TEST_SAMPLES_DIR, { cache: "no-store" });
  if (!listingResponse.ok) {
    throw new Error("Could not read ./test_samples/. Add test_samples/manifest.json or enable directory listing.");
  }

  const listingHtml = await listingResponse.text();
  const parser = new DOMParser();
  const doc = parser.parseFromString(listingHtml, "text/html");
  const urls = [...doc.querySelectorAll("a[href]")]
    .map((anchor) => anchor.getAttribute("href"))
    .map(normalizeSampleUrl)
    .filter(Boolean);

  if (!urls.length) {
    throw new Error("No test sample files were found.");
  }

  return [...new Set(urls)];
};

const getFilenameFromUrl = (url) => {
  try {
    const pathname = new URL(url, window.location.href).pathname;
    const decoded = decodeURIComponent(pathname);
    return decoded.split("/").filter(Boolean).pop() || "test-sample";
  } catch (error) {
    return "test-sample";
  }
};

const inferMimeType = (filename) => {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".bmp")) return "image/bmp";
  if (lower.endsWith(".gif")) return "image/gif";
  return "image/png";
};

const classifySelectedFile = async () => {
  if (!selectedFile) {
    setStatus("Choose an image first.", "bad");
    return false;
  }

  sendBtn.disabled = true;
  clearBtn.disabled = true;
  if (testBtn) testBtn.disabled = true;
  setLoading(true);
  setResultBadge("Running inference");
  setStatus("Uploading image and classifying board…");

  try {
    const formData = new FormData();
    formData.append("file", selectedFile);

    const response = await fetch(CLASSIFY_ENDPOINT, {
      method: "POST",
      body: formData
    });

    if (!response.ok) {
      const contentType = response.headers.get("content-type") || "";
      let detail = `Request failed with status ${response.status}.`;

      if (contentType.includes("application/json")) {
        const json = await response.json().catch(() => null);
        if (json?.detail) detail = json.detail;
      } else {
        const text = await response.text().catch(() => "");
        if (text) detail = text;
      }

      throw new Error(detail);
    }

    const data = await response.json();
    renderResponse(data);
    setStatus("Board classification completed successfully.", "ok");
    return true;
  } catch (error) {
    resetResult();
    setStatus(error?.message || String(error), "bad");
    setResultBadge("Error");
    return false;
  } finally {
    updateButtons();
  }
};

const loadRandomTestSample = async () => {
  if (!backendReady) {
    setStatus("Ping the backend first.", "bad");
    return;
  }

  testBtn.disabled = true;
  sendBtn.disabled = true;
  clearBtn.disabled = true;
  setStatus("Loading a random test image…");
  resetResult();

  try {
    const urls = await fetchTestSampleUrls();
    const randomUrl = urls[Math.floor(Math.random() * urls.length)];
    const response = await fetch(randomUrl, { cache: "no-store" });

    if (!response.ok) {
      throw new Error(`Failed to load sample image (${response.status}).`);
    }

    const blob = await response.blob();
    const filename = getFilenameFromUrl(randomUrl);
    const file = new File([blob], filename, {
      type: blob.type || inferMimeType(filename),
      lastModified: Date.now()
    });

    fileInput.value = "";
    selectedFile = file;
    showPreview(file, "Random sample");
    updateButtons();
    setStatus(`Loaded test sample: ${filename}. Starting classification…`, "ok");
    await classifySelectedFile();
  } catch (error) {
    selectedFile = null;
    resetPreview();
    resetResult();
    updateButtons();
    setStatus(error?.message || String(error), "bad");
  } finally {
    updateButtons();
  }
};

const renderBoard = (board, unicodeBoard, pieceNameBoard) => {
  const files = ["a", "b", "c", "d", "e", "f", "g", "h"];
  boardGrid.innerHTML = "";

  board.forEach((row, rowIndex) => {
    row.forEach((value, colIndex) => {
      const square = document.createElement("div");
      const isLight = (rowIndex + colIndex) % 2 === 0;
      const coord = `${files[colIndex]}${8 - rowIndex}`;
      const name = pieceNameBoard?.[rowIndex]?.[colIndex] || FILE_VALUE_TO_NAME[value] || "unknown";
      const symbol = unicodeBoard?.[rowIndex]?.[colIndex] ?? FILE_VALUE_TO_UNICODE[value] ?? "";

      square.className = `square ${isLight ? "light" : "dark"}${value === 12 ? " empty" : ""}`;
      square.title = `${coord} • ${name} • value ${value}`;
      square.innerHTML = `
        <span class="square-coord">${coord}</span>
        <span class="square-piece">${symbol || ""}</span>
        <span class="square-value">${value}</span>
      `;
      boardGrid.appendChild(square);
    });
  });
};

const renderPieceCounts = (counts) => {
  pieceCounts.innerHTML = "";
  Object.entries(counts || {}).forEach(([name, count]) => {
    const item = document.createElement("div");
    item.className = "count-item";
    item.innerHTML = `<span>${name}</span><strong>${count}</strong>`;
    pieceCounts.appendChild(item);
  });
};

const renderResponse = (data) => {
  const board = data?.board;
  if (!Array.isArray(board) || board.length !== 8) {
    throw new Error("Backend response is missing a valid 8x8 board.");
  }

  renderBoard(board, data.unicodeBoard, data.pieceNameBoard);
  renderPieceCounts(data.pieceCounts);
  boardJson.textContent = JSON.stringify(board, null, 2);
  fenValue.textContent = data.fen || "";

  resultPlaceholder.classList.add("hidden");
  resultContent.classList.remove("hidden");
  setResultBadge("Board classified");
};

pingBtn.addEventListener("click", async () => {
  pingBtn.disabled = true;
  setStatus("Checking backend health…");

  try {
    const response = await fetch(HEALTH_ENDPOINT, { method: "GET" });
    if (!response.ok) {
      throw new Error(`Health check failed with status ${response.status}.`);
    }

    const data = await response.json();
    if (!data?.ok) {
      throw new Error("Backend returned an unexpected health response.");
    }

    setBackendReady(true);
    setStatus("Backend is reachable. You can now choose an image or use Test me!", "ok");
  } catch (error) {
    setBackendReady(false);
    setStatus(error?.message || String(error), "bad");
  } finally {
    pingBtn.disabled = false;
  }
});

if (testBtn) {
  testBtn.addEventListener("click", loadRandomTestSample);
}

fileInput.addEventListener("change", () => {
  const [file] = fileInput.files || [];
  selectedFile = file || null;

  resetResult();

  if (!selectedFile) {
    resetPreview();
    updateButtons();
    setStatus("Choose an image, use Test me!, then classify it.");
    return;
  }

  if (!selectedFile.type.startsWith("image/")) {
    fileInput.value = "";
    selectedFile = null;
    resetPreview();
    updateButtons();
    setStatus("Please choose a valid image file.", "bad");
    return;
  }

  showPreview(selectedFile, "Local file");
  updateButtons();
  setStatus("Image selected. Click “Classify Board”.", "ok");
});

clearBtn.addEventListener("click", () => {
  fileInput.value = "";
  selectedFile = null;
  resetPreview();
  resetResult();
  updateButtons();
  setStatus("Cleared.");
});

sendBtn.addEventListener("click", async () => {
  await classifySelectedFile();
});

if (copyBoardBtn) {
  copyBoardBtn.addEventListener("click", async () => {
    try {
      const text = boardJson?.textContent || "";
      const ok = await copyToClipboard(text);
      if (ok) {
        flashCopyState(copyBoardBtn);
        setStatus("Copied numeric board to clipboard.", "ok");
      }
    } catch (error) {
      setStatus("Copy failed. Select the text and copy manually.", "bad");
    }
  });
}

if (copyFenBtn) {
  copyFenBtn.addEventListener("click", async () => {
    try {
      const text = (fenValue?.textContent || "").trim();
      if (!text) {
        setStatus("No FEN to copy yet.", "bad");
        return;
      }
      const ok = await copyToClipboard(text);
      if (ok) {
        flashCopyState(copyFenBtn);
        setStatus("Copied FEN to clipboard.", "ok");
      }
    } catch (error) {
      setStatus("Copy failed. Select the FEN text and copy manually.", "bad");
    }
  });
}

resetPreview();
resetResult();
updateButtons();
