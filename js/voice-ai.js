/**
 * LocalShop Voice AI — frontend module (v2)
 * ──────────────────────────────────────────
 * Fixes from v1:
 *   - MediaRecorder.start(250) — emits chunks every 250ms (some browsers
 *     don't deliver any data without a timeslice)
 *   - Detailed console logging for debugging
 *   - Min recording length check (rejects too-short audio before sending)
 *   - Better error display (shows server message, not just "STT failed")
 *   - Proper Promise wrapping for stop() so we wait until last chunk arrives
 */

// ⚠️ CHANGE THIS to your deployed Cloudflare Worker URL
const WORKER_URL = "https://localshop-voice.sunilkumarm048.workers.dev";

const conversationHistory = [];

export function initVoiceAI({ getProducts, getShops }) {
  injectStyles();
  const ui = injectUI();

  let mediaRecorder = null;
  let chunks = [];
  let stream = null;
  let isRecording = false;
  let isProcessing = false;
  let recordStartTime = 0;

  ui.micBtn.addEventListener("click", async () => {
    if (isProcessing) return;
    if (!isRecording) {
      await startRecording();
    } else {
      await stopRecording();
    }
  });

  ui.closeBtn.addEventListener("click", () => {
    ui.panel.classList.remove("show");
    ui.backdrop.classList.remove("show");
  });

  ui.backdrop.addEventListener("click", () => {
    ui.panel.classList.remove("show");
    ui.backdrop.classList.remove("show");
  });

  async function startRecording() {
    console.log("[VoiceAI] Requesting mic access…");
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      console.log("[VoiceAI] Mic granted, tracks:", stream.getAudioTracks());
    } catch (e) {
      console.error("[VoiceAI] Mic denied:", e);
      showError("Mic access denied. Please allow microphone in browser settings.");
      return;
    }

    chunks = [];

    // Pick a supported MIME type
    let mime = "audio/webm;codecs=opus";
    if (!MediaRecorder.isTypeSupported(mime)) {
      mime = "audio/webm";
      if (!MediaRecorder.isTypeSupported(mime)) {
        mime = "audio/mp4"; // iOS Safari
        if (!MediaRecorder.isTypeSupported(mime)) {
          mime = ""; // browser default
        }
      }
    }
    console.log("[VoiceAI] Using MIME:", mime || "browser default");

    try {
      mediaRecorder = mime ? new MediaRecorder(stream, { mimeType: mime })
                           : new MediaRecorder(stream);
    } catch (e) {
      console.error("[VoiceAI] MediaRecorder init failed:", e);
      showError("Browser doesn't support audio recording");
      stream.getTracks().forEach(t => t.stop());
      return;
    }

    mediaRecorder.ondataavailable = (e) => {
      console.log("[VoiceAI] Chunk received:", e.data?.size, "bytes");
      if (e.data && e.data.size > 0) chunks.push(e.data);
    };

    mediaRecorder.onerror = (e) => {
      console.error("[VoiceAI] Recorder error:", e);
    };

    // 🔥 KEY FIX: pass timeslice (250ms) so chunks fire while recording
    mediaRecorder.start(250);
    recordStartTime = Date.now();
    isRecording = true;

    ui.micBtn.classList.add("recording");
    ui.micBtn.innerHTML = "⏹";
    showStatus("Listening… tap to stop");
    ui.panel.classList.add("show");
    ui.backdrop.classList.add("show");
    ui.error.classList.remove("show");

    // Auto-stop after 20 seconds
    setTimeout(() => { if (isRecording) stopRecording(); }, 20000);
  }

  async function stopRecording() {
    if (!mediaRecorder || mediaRecorder.state === "inactive") return;

    const duration = Date.now() - recordStartTime;
    console.log("[VoiceAI] Stopping after", duration, "ms");

    isRecording = false;
    ui.micBtn.classList.remove("recording");
    ui.micBtn.innerHTML = "🎤";
    setProcessing(true);

    // Wait for the recorder to finalize and stream to release
    await new Promise((resolve) => {
      mediaRecorder.onstop = () => {
        if (stream) stream.getTracks().forEach(t => t.stop());
        resolve();
      };
      mediaRecorder.stop();
    });

    const mime = mediaRecorder.mimeType || "audio/webm";
    const blob = new Blob(chunks, { type: mime });
    console.log("[VoiceAI] Final blob:", blob.size, "bytes,", chunks.length, "chunks");

    if (duration < 500) {
      showError("Recording too short. Please hold and speak for at least 1 second.");
      setProcessing(false);
      return;
    }
    if (blob.size < 1000) {
      showError(`No audio captured (${blob.size} bytes). Check your mic and try again.`);
      setProcessing(false);
      return;
    }

    await sendAudio(blob);
  }

  async function sendAudio(blob) {
    showStatus("Thinking…");

    try {
      const products = (getProducts?.() || []).map(slimProduct);
      const shops    = (getShops?.()    || []).map(slimShop);
      console.log("[VoiceAI] Sending", products.length, "products,", shops.length, "shops");

      const fd = new FormData();
      fd.append("audio", blob, "audio.webm");
      fd.append("products", JSON.stringify(products));
      fd.append("shops", JSON.stringify(shops));
      fd.append("history", JSON.stringify(conversationHistory.slice(-6)));

      console.log("[VoiceAI] POST", WORKER_URL + "/api/voice");
      const res = await fetch(`${WORKER_URL}/api/voice`, {
        method: "POST",
        body: fd,
      });

      const text = await res.text();
      console.log("[VoiceAI] Response status:", res.status);
      console.log("[VoiceAI] Response body (first 500 chars):", text.slice(0, 500));

      let data;
      try { data = JSON.parse(text); }
      catch { throw new Error("Server returned invalid JSON: " + text.slice(0, 200)); }

      if (!res.ok) {
        const detail = data.detail ? ` (${data.detail.slice(0, 150)})` : "";
        throw new Error((data.error || `Server error ${res.status}`) + detail);
      }

      ui.transcript.textContent = "🗣️ " + data.transcript;
      ui.reply.textContent = data.replyText;

      conversationHistory.push({ role: "user",      content: data.transcript });
      conversationHistory.push({ role: "assistant", content: data.replyText });

      if (data.replyAudio) playAudio(data.replyAudio);
      hideStatus();
    } catch (e) {
      console.error("[VoiceAI] sendAudio failed:", e);
      showError(e.message || "Could not get a reply. Try again.");
    } finally {
      setProcessing(false);
    }
  }

  function playAudio(base64) {
    try {
      const audio = new Audio("data:audio/wav;base64," + base64);
      audio.play().catch((e) => console.warn("[VoiceAI] Audio play blocked:", e));
    } catch (e) {
      console.error("[VoiceAI] Audio decode failed:", e);
    }
  }

  function setProcessing(p) {
    isProcessing = p;
    ui.micBtn.classList.toggle("processing", p);
    if (p) ui.micBtn.innerHTML = "⏳";
    else if (!isRecording) ui.micBtn.innerHTML = "🎤";
  }

  function showStatus(msg) {
    ui.status.textContent = msg;
    ui.status.classList.add("show");
    ui.error.classList.remove("show");
  }
  function hideStatus() { ui.status.classList.remove("show"); }
  function showError(msg) {
    ui.error.textContent = "⚠️ " + msg;
    ui.error.classList.add("show");
    ui.status.classList.remove("show");
    ui.panel.classList.add("show");
    ui.backdrop.classList.add("show");
  }
}

/* slim down data sent to worker */
function slimProduct(p) {
  return {
    name: p.name,
    price: Number(p.price) || 0,
    mrp: p.mrp ? Number(p.mrp) : null,
    weight: p.weight || p.qty || p.unit || null,
    shopName: p.shopName || null,
    category: p.category || p.__topCategory || null,
    inStock: p.__shopOpen !== false,
  };
}
function slimShop(s) {
  return {
    shopName: s.shopName,
    category: s.category || s.__typeName,
    isOpen: s.__isOpen !== false,
  };
}

/* inject CSS */
function injectStyles() {
  if (document.getElementById("voice-ai-styles")) return;
  const css = `
.voice-mic-btn{
  position:fixed;right:16px;bottom:96px;
  width:58px;height:58px;border-radius:50%;
  background:linear-gradient(135deg,#0C831F 0%,#0a6b18 100%);
  color:#fff;font-size:24px;border:none;cursor:pointer;
  box-shadow:0 6px 20px rgba(12,131,31,.35);
  display:flex;align-items:center;justify-content:center;
  z-index:1100;transition:transform .15s, box-shadow .15s;
}
.voice-mic-btn:hover{transform:scale(1.05);}
.voice-mic-btn:active{transform:scale(.95);}
.voice-mic-btn.recording{
  background:linear-gradient(135deg,#d23030 0%,#a71f1f 100%);
  animation:vai-pulse 1.2s infinite;
}
.voice-mic-btn.processing{background:#888;cursor:wait;animation:none;}
@keyframes vai-pulse{
  0%,100%{box-shadow:0 6px 20px rgba(210,48,48,.5);}
  50%{box-shadow:0 6px 28px rgba(210,48,48,.85),0 0 0 10px rgba(210,48,48,.12);}
}
.voice-backdrop{
  position:fixed;inset:0;background:rgba(0,0,0,.45);
  z-index:1099;display:none;opacity:0;transition:opacity .2s;
}
.voice-backdrop.show{display:block;opacity:1;}
.voice-panel{
  position:fixed;left:50%;bottom:170px;transform:translateX(-50%) translateY(20px);
  background:#fff;border-radius:18px;
  width:min(420px,92vw);
  box-shadow:0 12px 40px rgba(0,0,0,.25);
  padding:18px 18px 16px;z-index:1101;
  opacity:0;pointer-events:none;
  transition:all .25s ease;
  font-family:'Inter',Arial,sans-serif;
}
.voice-panel.show{opacity:1;pointer-events:auto;transform:translateX(-50%) translateY(0);}
.voice-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;}
.voice-title{font-size:14px;font-weight:700;color:#1f1f1f;display:flex;align-items:center;gap:6px;}
.voice-title .dot{width:8px;height:8px;border-radius:50%;background:#0C831F;display:inline-block;}
.voice-close{background:#f0f0f0;border:none;border-radius:50%;width:28px;height:28px;cursor:pointer;font-size:14px;display:flex;align-items:center;justify-content:center;color:#666;}
.voice-close:hover{background:#e0e0e0;}
.voice-status{font-size:13px;color:#0C831F;font-weight:600;margin:8px 0;display:none;}
.voice-status.show{display:block;}
.voice-error{font-size:13px;color:#d23030;font-weight:500;margin:8px 0;background:#fee;padding:8px 10px;border-radius:8px;display:none;word-break:break-word;}
.voice-error.show{display:block;}
.voice-transcript{background:#f8f8f8;border-radius:10px;padding:10px 12px;font-size:13px;color:#444;margin:8px 0;min-height:18px;line-height:1.4;}
.voice-reply{background:#fff5d6;border-left:3px solid #F0B91D;border-radius:10px;padding:12px 14px;font-size:14px;color:#1f1f1f;line-height:1.5;min-height:24px;font-weight:500;}
.voice-hint{font-size:11px;color:#888;text-align:center;margin-top:10px;}
`;
  const style = document.createElement("style");
  style.id = "voice-ai-styles";
  style.textContent = css;
  document.head.appendChild(style);
}

function injectUI() {
  const backdrop = document.createElement("div");
  backdrop.className = "voice-backdrop";

  const panel = document.createElement("div");
  panel.className = "voice-panel";
  panel.innerHTML = `
    <div class="voice-header">
      <div class="voice-title"><span class="dot"></span> Shopkeeper Assistant</div>
      <button class="voice-close" aria-label="Close">✕</button>
    </div>
    <div class="voice-status"></div>
    <div class="voice-error"></div>
    <div class="voice-transcript">Tap the mic and ask me anything…</div>
    <div class="voice-reply">नमस्ते 🙏 मैं आपकी कैसे मदद कर सकता हूँ?</div>
    <div class="voice-hint">Speak in Hindi, Odia or English</div>
  `;

  const micBtn = document.createElement("button");
  micBtn.className = "voice-mic-btn";
  micBtn.setAttribute("aria-label", "Voice assistant");
  micBtn.innerHTML = "🎤";

  document.body.appendChild(backdrop);
  document.body.appendChild(panel);
  document.body.appendChild(micBtn);

  return {
    backdrop, panel, micBtn,
    closeBtn:   panel.querySelector(".voice-close"),
    status:     panel.querySelector(".voice-status"),
    error:      panel.querySelector(".voice-error"),
    transcript: panel.querySelector(".voice-transcript"),
    reply:      panel.querySelector(".voice-reply"),
  };
}
