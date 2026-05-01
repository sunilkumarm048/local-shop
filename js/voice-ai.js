/**
 * LocalShop Voice AI — frontend module
 * ─────────────────────────────────────
 * Adds a floating mic button to your page. Customer taps → speaks →
 * sees transcript + hears AI shopkeeper reply.
 *
 * USAGE:
 *   import { initVoiceAI } from "/local-shop/js/voice-ai.js";
 *   initVoiceAI({ getProducts, getShops });
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

  ui.micBtn.addEventListener("click", async () => {
    if (isProcessing) return;
    if (!isRecording) {
      await startRecording();
    } else {
      stopRecording();
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
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: 16000,
          echoCancellation: true,
          noiseSuppression: true,
        },
      });
    } catch (e) {
      showError("Mic access denied. Please allow microphone in browser settings.");
      return;
    }

    chunks = [];
    const mime = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
      ? "audio/webm;codecs=opus"
      : "audio/webm";
    mediaRecorder = new MediaRecorder(stream, { mimeType: mime });

    mediaRecorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chunks.push(e.data);
    };

    mediaRecorder.onstop = async () => {
      stream.getTracks().forEach((t) => t.stop());
      const blob = new Blob(chunks, { type: mime });
      await sendAudio(blob);
    };

    mediaRecorder.start();
    isRecording = true;
    ui.micBtn.classList.add("recording");
    ui.micBtn.innerHTML = "⏹";
    showStatus("Listening… tap to stop");
    ui.panel.classList.add("show");
    ui.backdrop.classList.add("show");

    // Safety: auto-stop after 20 seconds
    setTimeout(() => { if (isRecording) stopRecording(); }, 20000);
  }

  function stopRecording() {
    if (!mediaRecorder || mediaRecorder.state === "inactive") return;
    mediaRecorder.stop();
    isRecording = false;
    ui.micBtn.classList.remove("recording");
    ui.micBtn.innerHTML = "🎤";
    setProcessing(true);
  }

  async function sendAudio(blob) {
    showStatus("Thinking…");

    try {
      const products = (getProducts?.() || []).map(slimProduct);
      const shops = (getShops?.() || []).map(slimShop);

      const fd = new FormData();
      fd.append("audio", blob, "audio.webm");
      fd.append("products", JSON.stringify(products));
      fd.append("shops", JSON.stringify(shops));
      fd.append("history", JSON.stringify(conversationHistory.slice(-6)));

      const res = await fetch(`${WORKER_URL}/api/voice`, {
        method: "POST",
        body: fd,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Server error ${res.status}`);
      }

      const data = await res.json();
      ui.transcript.textContent = "🗣️ " + data.transcript;
      ui.reply.textContent = data.replyText;

      conversationHistory.push({ role: "user", content: data.transcript });
      conversationHistory.push({ role: "assistant", content: data.replyText });

      if (data.replyAudio) playAudio(data.replyAudio);
      hideStatus();
    } catch (e) {
      console.error(e);
      showError(e.message || "Could not get a reply. Try again.");
    } finally {
      setProcessing(false);
    }
  }

  function playAudio(base64) {
    try {
      const audio = new Audio("data:audio/wav;base64," + base64);
      audio.play().catch((e) => console.warn("Audio play blocked:", e));
    } catch (e) {
      console.error("Audio decode failed:", e);
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
  function hideStatus() {
    ui.status.classList.remove("show");
  }
  function showError(msg) {
    ui.error.textContent = "⚠️ " + msg;
    ui.error.classList.add("show");
    ui.status.classList.remove("show");
    ui.panel.classList.add("show");
    ui.backdrop.classList.add("show");
  }
}

/* ────────── slim down data sent to worker ────────── */
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

/* ────────── inject CSS ────────── */
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
.voice-mic-btn.processing{
  background:#888;cursor:wait;animation:none;
}
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
.voice-panel.show{
  opacity:1;pointer-events:auto;
  transform:translateX(-50%) translateY(0);
}

.voice-header{
  display:flex;justify-content:space-between;align-items:center;
  margin-bottom:10px;
}
.voice-title{
  font-size:14px;font-weight:700;color:#1f1f1f;
  display:flex;align-items:center;gap:6px;
}
.voice-title .dot{
  width:8px;height:8px;border-radius:50%;
  background:#0C831F;display:inline-block;
}
.voice-close{
  background:#f0f0f0;border:none;border-radius:50%;
  width:28px;height:28px;cursor:pointer;font-size:14px;
  display:flex;align-items:center;justify-content:center;
  color:#666;
}
.voice-close:hover{background:#e0e0e0;}

.voice-status{
  font-size:13px;color:#0C831F;font-weight:600;
  margin:8px 0;display:none;
}
.voice-status.show{display:block;}
.voice-error{
  font-size:13px;color:#d23030;font-weight:500;
  margin:8px 0;background:#fee;padding:8px 10px;
  border-radius:8px;display:none;
}
.voice-error.show{display:block;}

.voice-transcript{
  background:#f8f8f8;border-radius:10px;
  padding:10px 12px;font-size:13px;color:#444;
  margin:8px 0;min-height:18px;line-height:1.4;
}
.voice-reply{
  background:#fff5d6;border-left:3px solid #F0B91D;
  border-radius:10px;padding:12px 14px;
  font-size:14px;color:#1f1f1f;line-height:1.5;
  min-height:24px;font-weight:500;
}
.voice-hint{
  font-size:11px;color:#888;text-align:center;
  margin-top:10px;
}
`;
  const style = document.createElement("style");
  style.id = "voice-ai-styles";
  style.textContent = css;
  document.head.appendChild(style);
}

/* ────────── inject DOM ────────── */
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
