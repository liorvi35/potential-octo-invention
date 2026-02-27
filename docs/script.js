const BASE_ORIGIN = "https://chess-api-en20.onrender.com";
      const ENDPOINT = `${BASE_ORIGIN}/boardClassification`;
      const HEALTH_ENDPOINT = `${BASE_ORIGIN}/health`;

      const pingBtn = document.getElementById("pingBtn");
      const pingStatus = document.getElementById("pingStatus");

      const fileInput = document.getElementById("fileInput");
      const sendBtn = document.getElementById("sendBtn");
      const clearBtn = document.getElementById("clearBtn");
      const clientStatus = document.getElementById("clientStatus");

      const inputPreview = document.getElementById("inputPreview");
      const inputPlaceholder = document.getElementById("inputPlaceholder");
      const inputMeta = document.getElementById("inputMeta");

      const outputPreview = document.getElementById("outputPreview");
      const outputPlaceholder = document.getElementById("outputPlaceholder");
      const outputMeta = document.getElementById("outputMeta");

      let selectedFile = null;
      let inputObjectUrl = null;
      let outputObjectUrl = null;
      let pingOk = false;

      const setStatus = (msg, kind = "") => {
        clientStatus.textContent = msg || "";
        clientStatus.className = "status" + (kind ? " " + kind : "");
      };

      const setPingStatus = (msg, kind = "") => {
        pingStatus.textContent = msg || "";
        pingStatus.className = "status" + (kind ? " " + kind : "");
      };

      const resetOutput = () => {
        outputMeta.textContent = "";
        outputPreview.style.display = "none";
        outputPreview.removeAttribute("src");
        outputPlaceholder.style.display = "block";
        if (outputObjectUrl) URL.revokeObjectURL(outputObjectUrl);
        outputObjectUrl = null;
      };

      const resetInput = () => {
        inputMeta.textContent = "";
        inputPreview.style.display = "none";
        inputPreview.removeAttribute("src");
        inputPlaceholder.style.display = "block";
        if (inputObjectUrl) URL.revokeObjectURL(inputObjectUrl);
        inputObjectUrl = null;
      };

      const updateUiGates = () => {
        fileInput.disabled = !pingOk;

        clearBtn.disabled = !pingOk || !selectedFile;
        sendBtn.disabled = !pingOk || !selectedFile;

        if (!pingOk) {
          fileInput.value = "";
          selectedFile = null;
          resetInput();
          resetOutput();
        }
      };

      const clearAll = () => {
        fileInput.value = "";
        selectedFile = null;
        setStatus("");
        resetInput();
        resetOutput();
        updateUiGates();
      };

      const arrayBufferToBase64 = (buffer) => {
        const bytes = new Uint8Array(buffer);
        let binary = "";
        const chunkSize = 0x8000;
        for (let i = 0; i < bytes.length; i += chunkSize) {
          binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
        }
        return btoa(binary);
      };

      const showInputPreview = (file) => {
        resetInput();
        inputObjectUrl = URL.createObjectURL(file);
        inputPreview.src = inputObjectUrl;
        inputPreview.style.display = "block";
        inputPlaceholder.style.display = "none";
        inputMeta.innerHTML = `
          <div><b>Name:</b> ${file.name}</div>
          <div><b>Type:</b> ${file.type || "unknown"}</div>
          <div><b>Size:</b> ${(file.size / 1024).toFixed(1)} KB</div>
        `;
      };

      const showOutputPreviewFromBlob = (blob) => {
        resetOutput();
        outputObjectUrl = URL.createObjectURL(blob);
        outputPreview.src = outputObjectUrl;
        outputPreview.style.display = "block";
        outputPlaceholder.style.display = "none";
        outputMeta.innerHTML = `
          <div><b>Type:</b> ${blob.type || "image/png"}</div>
          <div><b>Size:</b> ${(blob.size / 1024).toFixed(1)} KB</div>
        `;
      };

      pingBtn.addEventListener("click", async () => {
        setStatus("");
        setPingStatus("Waking Server Up…");
        pingBtn.disabled = true;

        try {
          const res = await fetch(HEALTH_ENDPOINT, { method: "GET" });
          if (!res.ok) throw new Error(`Health check failed (${res.status})`);

          const data = await res.json().catch(() => null);
          if (!data || data.ok !== true) {
            throw new Error('Unexpected health response (expected {"ok": true}).');
          }

          pingOk = true;
          setPingStatus("Server OK ✓", "ok");
        } catch (err) {
          pingOk = false;
          setPingStatus(err?.message || String(err), "bad");
        } finally {
          pingBtn.disabled = false;
          updateUiGates();
        }
      });

      fileInput.addEventListener("change", () => {
        setStatus("");
        resetOutput();

        if (!pingOk) {
          setStatus("Please click Ping first.", "bad");
          fileInput.value = "";
          return;
        }

        const file = fileInput.files && fileInput.files[0];
        if (!file) {
          selectedFile = null;
          updateUiGates();
          return;
        }

        if (file.type !== "image/png" && !file.name.toLowerCase().endsWith(".png")) {
          selectedFile = null;
          resetInput();
          setStatus("Only PNG files are allowed. Please choose a .png file.", "bad");
          updateUiGates();
          return;
        }

        selectedFile = file;
        showInputPreview(file);
        updateUiGates();
      });

      clearBtn.addEventListener("click", clearAll);

      sendBtn.addEventListener("click", async () => {
        if (!pingOk) {
          setStatus("Please click Ping first.", "bad");
          return;
        }
        if (!selectedFile) return;

        setStatus("Uploading…");
        sendBtn.disabled = true;
        clearBtn.disabled = true;

        try {
          const buffer = await selectedFile.arrayBuffer();
          const imageBase64 = arrayBufferToBase64(buffer);

          const payload = { filename: selectedFile.name, contentType: "image/png", imageBase64 };

          const res = await fetch(ENDPOINT, {
            method: "POST",
            headers: { "Content-Type": "application/json", "Accept": "image/png, application/json" },
            body: JSON.stringify(payload)
          });

          if (!res.ok) {
            const ct = res.headers.get("content-type") || "";
            let detail = "";
            if (ct.includes("application/json")) {
              const j = await res.json().catch(() => null);
              if (j && (j.detail || j.message || j.error)) detail = String(j.detail || j.message || j.error);
            } else {
              detail = await res.text().catch(() => "");
            }
            throw new Error(`Server error (${res.status}). ${detail}`.trim());
          }

          const blob = await res.blob();
          if (!blob.type.startsWith("image/")) throw new Error(`Unexpected response type: ${blob.type || "unknown"}`);

          showOutputPreviewFromBlob(blob);
          setStatus("Done ✓", "ok");
        } catch (err) {
          resetOutput();
          setStatus(err?.message || String(err), "bad");
        } finally {
          updateUiGates();
        }
      });

      setPingStatus("Ping required.", "");
      updateUiGates();
