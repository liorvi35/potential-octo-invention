(() => {
  const API_BASE = window.CHESS_API_BASE || "";
  const ENDPOINTS = {
    ping: `${API_BASE}/ping`,
    classify: `${API_BASE}/boardClassification`,
  };

  const el = (id) => document.getElementById(id);

  const pingBtn = el("pingBtn");
  const fileInput = el("fileInput");
  const filePicker = document.querySelector(".file-picker");
  const testBtn = el("testBtn");
  const sendBtn = el("sendBtn");
  const clearBtn = el("clearBtn");
  const status = el("status");

  const inputPreview = el("inputPreview");
  const inputPlaceholder = el("inputPlaceholder");
  const inputBadge = el("inputBadge");
  const inputMeta = el("inputMeta");

  const resultBadge = el("resultBadge");
  const resultPlaceholder = el("resultPlaceholder");
  const resultMessage = el("resultMessage");
  const loadingWrap = el("loadingWrap");
  const resultContent = el("resultContent");

  const fenValue = el("fenValue");
  const boardGrid = el("boardGrid");
  const boardJson = el("boardJson");
  const pieceCounts = el("pieceCounts");
  const copyFenBtn = el("copyFenBtn");
  const copyBoardBtn = el("copyBoardBtn");

  let selectedFile = null;

  const setStatus = (message) => {
    status.textContent = message;
  };

  const setBackendEnabled = (enabled) => {
    fileInput.disabled = !enabled;
    testBtn.disabled = !enabled;
    filePicker.classList.toggle("disabled", !enabled);
    filePicker.setAttribute("aria-disabled", String(!enabled));
  };

  const showLoading = (message) => {
    resultContent.classList.add("hidden");
    resultPlaceholder.classList.remove("hidden");
    resultMessage.textContent = message;
    loadingWrap.classList.remove("hidden");
    resultBadge.textContent = "Running";
  };

  const showError = (message) => {
    loadingWrap.classList.add("hidden");
    resultPlaceholder.classList.remove("hidden");
    resultContent.classList.add("hidden");
    resultMessage.textContent = message;
    resultBadge.textContent = "Error";
    setStatus(message);
  };

  const resetResult = () => {
    loadingWrap.classList.add("hidden");
    resultPlaceholder.classList.remove("hidden");
    resultContent.classList.add("hidden");
    resultMessage.textContent = "The backend response will appear here after classification.";
    resultBadge.textContent = "Waiting";
    fenValue.textContent = "";
    boardGrid.innerHTML = "";
    boardJson.textContent = "";
    pieceCounts.innerHTML = "";
  };

  const setSelectedFile = (file) => {
    selectedFile = file;
    resetResult();

    if (!file) {
      inputPreview.removeAttribute("src");
      inputPreview.style.display = "none";
      inputPlaceholder.classList.remove("hidden");
      inputBadge.textContent = "No file selected";
      inputMeta.textContent = "";
      sendBtn.disabled = true;
      clearBtn.disabled = true;
      return;
    }

    const objectUrl = URL.createObjectURL(file);
    inputPreview.src = objectUrl;
    inputPreview.onload = () => URL.revokeObjectURL(objectUrl);
    inputPreview.style.display = "block";
    inputPlaceholder.classList.add("hidden");
    inputBadge.textContent = file.name;
    inputMeta.textContent = `${file.type || "image"} · ${(file.size / 1024).toFixed(1)} KB`;
    sendBtn.disabled = false;
    clearBtn.disabled = false;
  };

  const copyText = async (text, label) => {
    if (!text) {
      return;
    }

    try {
      await navigator.clipboard.writeText(text);
      setStatus(`${label} copied.`);
    } catch {
      setStatus(`Could not copy ${label.toLowerCase()}.`);
    }
  };

  const renderPieceCounts = (counts) => {
    pieceCounts.innerHTML = "";

    if (!counts || typeof counts !== "object") {
      pieceCounts.textContent = "No counts returned.";
      return;
    }

    for (const [name, count] of Object.entries(counts)) {
      const item = document.createElement("div");
      item.className = "count-item";

      const key = document.createElement("span");
      key.className = "count-name";
      key.textContent = name;

      const value = document.createElement("strong");
      value.textContent = String(count);

      item.append(key, value);
      pieceCounts.appendChild(item);
    }
  };

  const renderBoardImage = (data) => {
    boardGrid.innerHTML = "";
    boardGrid.classList.add("rendered-board-container");

    const imageSrc = data.boardImage || data.boardImageJpeg || data.boardImageSvg;
    if (!imageSrc) {
      const fallback = document.createElement("div");
      fallback.className = "placeholder";
      fallback.textContent = "The backend did not return a rendered board image.";
      boardGrid.appendChild(fallback);
      return;
    }

    const img = document.createElement("img");
    img.className = "rendered-board-image";
    img.src = imageSrc;
    img.alt = "Backend-rendered chess board";
    boardGrid.appendChild(img);
  };

  const renderResult = (data) => {
    loadingWrap.classList.add("hidden");
    resultPlaceholder.classList.add("hidden");
    resultContent.classList.remove("hidden");
    resultBadge.textContent = "Done";

    fenValue.textContent = data.fullFen || data.fen || "";
    boardJson.textContent = JSON.stringify(data.board ?? [], null, 2);
    renderPieceCounts(data.pieceCounts);
    renderBoardImage(data);

    const format = data.boardImageFormat ? ` Rendered image format: ${data.boardImageFormat}.` : "";
    setStatus(`Classification completed.${format}`);
  };

  const readError = async (response) => {
    try {
      const body = await response.json();
      if (typeof body.detail === "string") {
        return body.detail;
      }
      return JSON.stringify(body.detail || body);
    } catch {
      return await response.text();
    }
  };

  const pingBackend = async () => {
    setStatus("Pinging backend...");
    try {
      const response = await fetch(ENDPOINTS.ping, { method: "GET" });
      if (!response.ok) {
        throw new Error(await readError(response));
      }
      setBackendEnabled(true);
      setStatus("Backend is online. You can upload an image now.");
    } catch (error) {
      setBackendEnabled(false);
      showError(`Backend ping failed: ${error.message}`);
    }
  };

  const classifySelectedFile = async () => {
    if (!selectedFile) {
      showError("Choose an image first.");
      return;
    }

    const form = new FormData();
    form.append("file", selectedFile, selectedFile.name || "board-image");

    sendBtn.disabled = true;
    showLoading("Classifying...");

    try {
      const response = await fetch(ENDPOINTS.classify, {
        method: "POST",
        body: form,
      });

      if (!response.ok) {
        throw new Error(await readError(response));
      }

      const data = await response.json();
      renderResult(data);
    } catch (error) {
      showError(`Classification failed: ${error.message}`);
    } finally {
      sendBtn.disabled = !selectedFile;
    }
  };

  const loadTestImage = async () => {
    const candidates = [
      "static/images/test.jpg",
      "static/images/test.jpeg",
      "static/images/test.png",
      "test.jpg",
      "test.jpeg",
      "test.png",
    ];

    for (const url of candidates) {
      try {
        const response = await fetch(url);
        if (!response.ok) {
          continue;
        }
        const blob = await response.blob();
        const extension = blob.type.split("/")[1] || "jpg";
        setSelectedFile(new File([blob], `test.${extension}`, { type: blob.type || "image/jpeg" }));
        setStatus(`Loaded test image from ${url}.`);
        return;
      } catch {
        // Try the next candidate.
      }
    }

    showError("Could not find a test image under static/images/test.* or project root test.*.");
  };

  pingBtn.addEventListener("click", pingBackend);
  fileInput.addEventListener("change", (event) => {
    const [file] = event.target.files || [];
    setSelectedFile(file || null);
  });
  sendBtn.addEventListener("click", classifySelectedFile);
  clearBtn.addEventListener("click", () => {
    fileInput.value = "";
    setSelectedFile(null);
    setStatus("Cleared.");
  });
  testBtn.addEventListener("click", loadTestImage);
  copyFenBtn.addEventListener("click", () => copyText(fenValue.textContent, "FEN"));
  copyBoardBtn.addEventListener("click", () => copyText(boardJson.textContent, "Numeric board"));

  setBackendEnabled(false);
  setSelectedFile(null);
})();
