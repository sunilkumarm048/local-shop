/**
 * LocalShop Voice AI — frontend module (v3 — continuous conversation)
 * ─────────────────────────────────────────────────────────────────────
 * NEW in v3:
 *   - Voice Activity Detection (VAD) using Web Audio API
 *   - Auto-stops mic when you stop talking (1.2s silence)
 *   - Continuous mode: mic auto-restarts after AI finishes speaking
 *   - Real-time volume visualization on mic button
 *   - Tap mic ONCE to start full conversation, tap again to end
 *   - Visual states: Listening / Thinking / Speaking / Idle
 */

// ⚠️ CHANGE THIS to your deployed Cloudflare Worker URL
const WORKER_URL = "https://localshop-voice.sunilkumarm048.workers.dev";

// VAD tuning
const SILENCE_THRESHOLD = 0.08;   // RMS volume below this = silence
const SILENCE_DURATION  = 800;    // ms of silence before auto-stop
const MIN_SPEECH_MS     = 300;     // need at least this much speech to send
const MAX_RECORDING_MS  = 25000;   // safety cap

const conversationHistory = [];

export function initVoiceAI({ getProducts, getShops }) {
  injectStyles();
  const ui = injectUI();

  let mediaRecorder = null;
  let chunks = [];
  let stream = null;
  let audioContext = null;
  let analyser = null;
  let vadInterval = null;
  let volumeData = null;

  let isConversationActive = false;  // user is in conversation mode (mic stays alive)
  let isRecording = false;            // currently capturing audio
  let isProcessing = false;
  let isSpeaking = false;             // AI is currently speaking
  let currentAudio = null;            // playing audio element

  let speechStartTime = 0;
  let lastSoundTime = 0;
  let recordStartTime = 0;
  let safetyTimer = null;

  ui.micBtn.addEventListener("click", async () => {
    if (isConversationActive) {
      // End conversation
      endConversation();
    } else {
      // Start conversation
      await startConversation();
    }
  });

  ui.closeBtn.addEventListener("click", () => {
    endConversation();
    ui.panel.classList.remove("show");
    ui.backdrop.classList.remove("show");
  });

  ui.backdrop.addEventListener("click", () => {
    endConversation();
    ui.panel.classList.remove("show");
    ui.backdrop.classList.remove("show");
  });

  /* ────────── conversation lifecycle ────────── */
  async function startConversation() {
    console.log("[VoiceAI] Starting conversation");
    ui.panel.classList.add("show");
    ui.backdrop.classList.add("show");

    const ok = await initMic();
    if (!ok) return;

    isConversationActive = true;
    setMode("listening");
    showStatus("Listening... bolo");
    startRecording();
  }

  function endConversation() {
    console.log("[VoiceAI] Ending conversation");
    isConversationActive = false;
    stopVAD();
    if (mediaRecorder && mediaRecorder.state !== "inactive") {
      mediaRecorder.stop();
    }
    if (stream) {
      stream.getTracks().forEach(t => t.stop());
      stream = null;
    }
    if (audioContext) {
      audioContext.close().catch(() => {});
      audioContext = null;
    }
    if (currentAudio) {
      currentAudio.pause();
      currentAudio = null;
    }
    if (safetyTimer) {
      clearTimeout(safetyTimer);
      safetyTimer = null;
    }
    isRecording = false;
    isSpeaking = false;
    isProcessing = false;
    setMode("idle");
    hideStatus();
  }

  /* ────────── mic + VAD setup ────────── */
  async function initMic() {
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      console.log("[VoiceAI] Mic granted");
    } catch (e) {
      console.error("[VoiceAI] Mic denied:", e);
      showError("Mic access denied. Please allow microphone.");
      return false;
    }

    // Setup Web Audio API for volume detection
    try {
      audioContext = new (window.AudioContext || window.webkitAudioContext)();
      const source = audioContext.createMediaStreamSource(stream);
      analyser = audioContext.createAnalyser();
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0.8;
      source.connect(analyser);
      volumeData = new Uint8Array(analyser.fftSize);
    } catch (e) {
      console.error("[VoiceAI] AudioContext failed:", e);
      // Continue without VAD — fall back to manual stop
    }

    return true;
  }

  /* ────────── recording with VAD ────────── */
  function startRecording() {
    if (!stream) return;

    chunks = [];

    let mime = "audio/webm;codecs=opus";
    if (!MediaRecorder.isTypeSupported(mime)) {
      mime = "audio/webm";
      if (!MediaRecorder.isTypeSupported(mime)) {
        mime = "audio/mp4";
        if (!MediaRecorder.isTypeSupported(mime)) mime = "";
      }
    }

    try {
      mediaRecorder = mime ? new MediaRecorder(stream, { mimeType: mime })
                           : new MediaRecorder(stream);
    } catch (e) {
      showError("Browser doesn't support recording");
      return;
    }

    mediaRecorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chunks.push(e.data);
    };

    mediaRecorder.onstop = () => {
      console.log("[VoiceAI] Recorder stopped, chunks:", chunks.length);
      const blob = new Blob(chunks, { type: mediaRecorder.mimeType || "audio/webm" });
      const duration = Date.now() - recordStartTime;
      const speechDuration = lastSoundTime - speechStartTime;

      console.log("[VoiceAI] Blob:", blob.size, "bytes, duration:", duration, "ms, speech:", speechDuration, "ms");

      // Only send if we captured real speech
      if (speechStartTime > 0 && speechDuration >= MIN_SPEECH_MS && blob.size > 1000) {
        sendAudio(blob);
      } else {
        console.log("[VoiceAI] Ignoring — too short or silent");
        // Restart listening if conversation still active
        if (isConversationActive && !isProcessing) {
          setTimeout(() => startRecording(), 100);
        }
      }
    };

    mediaRecorder.start(250);
    recordStartTime = Date.now();
    speechStartTime = 0;
    lastSoundTime = 0;
    isRecording = true;

    console.log("[VoiceAI] Recording started, VAD active");
    startVAD();

    // Safety: auto-stop after MAX_RECORDING_MS
    if (safetyTimer) clearTimeout(safetyTimer);
    safetyTimer = setTimeout(() => {
      console.log("[VoiceAI] Safety timeout — stopping");
      stopRecording();
    }, MAX_RECORDING_MS);
  }

  function stopRecording() {
    if (!mediaRecorder || mediaRecorder.state === "inactive") return;
    isRecording = false;
    stopVAD();
    if (safetyTimer) {
      clearTimeout(safetyTimer);
      safetyTimer = null;
    }
    mediaRecorder.stop();
  }

  /* ────────── Voice Activity Detection loop ────────── */
  function startVAD() {
    if (!analyser) {
      console.warn("[VoiceAI] No analyser, VAD disabled");
      return;
    }
    stopVAD();
    vadInterval = setInterval(() => {
      if (!isRecording || !analyser) return;

      analyser.getByteTimeDomainData(volumeData);

      // Calculate RMS volume (0..1)
      let sumSquares = 0;
      for (let i = 0; i < volumeData.length; i++) {
        const normalized = (volumeData[i] - 128) / 128;
        sumSquares += normalized * normalized;
      }
      const rms = Math.sqrt(sumSquares / volumeData.length);

      const now = Date.now();
      const isLoud = rms > SILENCE_THRESHOLD;

      // Update volume ring on mic button
      updateVolumeRing(rms);

      if (isLoud) {
        if (speechStartTime === 0) {
          speechStartTime = now;
          console.log("[VoiceAI] Speech detected");
        }
        lastSoundTime = now;
      } else if (speechStartTime > 0) {
        // We were speaking, now silent
        const silenceFor = now - lastSoundTime;
        if (silenceFor >= SILENCE_DURATION) {
          console.log("[VoiceAI] Silence detected for", silenceFor, "ms — auto-stopping");
          stopRecording();
        }
      }
    }, 80);
  }

  function stopVAD() {
    if (vadInterval) {
      clearInterval(vadInterval);
      vadInterval = null;
    }
    updateVolumeRing(0);
  }

  function updateVolumeRing(rms) {
    const scale = 1 + Math.min(rms * 8, 0.8);
    ui.micBtn.style.setProperty("--vol-scale", scale.toFixed(2));
  }

  /* ────────── send to worker ────────── */
  async function sendAudio(blob) {
    setMode("thinking");
    showStatus("Soch raha hoon...");
    setProcessing(true);

    try {
      const products = (getProducts?.() || []).map(slimProduct);
      const shops    = (getShops?.()    || []).map(slimShop);

      const fd = new FormData();
      fd.append("audio", blob, "audio.webm");
      fd.append("products", JSON.stringify(products));
      fd.append("shops", JSON.stringify(shops));
      fd.append("history", JSON.stringify(conversationHistory.slice(-8)));

      console.log("[VoiceAI] POST", WORKER_URL + "/api/voice");
      const res = await fetch(`${WORKER_URL}/api/voice`, { method: "POST", body: fd });
      const text = await res.text();

      let data;
      try { data = JSON.parse(text); }
      catch { throw new Error("Server returned invalid JSON"); }

      if (!res.ok) {
        const detail = data.detail ? ` (${data.detail.slice(0, 100)})` : "";
        throw new Error((data.error || `Server error ${res.status}`) + detail);
      }

      ui.transcript.textContent = "🗣️ " + data.transcript;
      ui.reply.textContent = data.replyText;

      conversationHistory.push({ role: "user",      content: data.transcript });
      conversationHistory.push({ role: "assistant", content: data.replyText });

      hideStatus();

      if (data.replyAudio) {
        await playAudio(data.replyAudio);
      } else {
        // No audio? Just go back to listening
        if (isConversationActive) restartListening();
      }
    } catch (e) {
      console.error("[VoiceAI] sendAudio failed:", e);
      showError(e.message || "Kuch problem aayi. Phir try kariye.");
      setProcessing(false);
      // After error, give user a chance to tap or auto-restart
      if (isConversationActive) {
        setTimeout(() => restartListening(), 1500);
      }
    }
  }

  /* ────────── play audio + restart listening when done ────────── */
  function playAudio(base64) {
    return new Promise((resolve) => {
      try {
        currentAudio = new Audio("data:audio/wav;base64," + base64);
        setMode("speaking");
        showStatus("Bol raha hoon...");

        currentAudio.onended = () => {
          console.log("[VoiceAI] AI finished speaking");
          isSpeaking = false;
          setProcessing(false);
          if (isConversationActive) {
            restartListening();
          } else {
            setMode("idle");
            hideStatus();
          }
          resolve();
        };

        currentAudio.onerror = (e) => {
          console.error("[VoiceAI] Audio playback error:", e);
          isSpeaking = false;
          setProcessing(false);
          if (isConversationActive) restartListening();
          resolve();
        };

        isSpeaking = true;
        currentAudio.play().catch((e) => {
          console.warn("[VoiceAI] Audio play blocked:", e);
          isSpeaking = false;
          setProcessing(false);
          if (isConversationActive) restartListening();
          resolve();
        });
      } catch (e) {
        console.error("[VoiceAI] Audio decode failed:", e);
        setProcessing(false);
        if (isConversationActive) restartListening();
        resolve();
      }
    });
  }

  function restartListening() {
    if (!isConversationActive) return;
    console.log("[VoiceAI] Restarting listener");
    setMode("listening");
    showStatus("Aapki sun raha hoon...");
    setProcessing(false);
    setTimeout(() => {
      if (isConversationActive && !isRecording) {
        startRecording();
      }
    }, 200);
  }

  /* ────────── UI helpers ────────── */
  function setMode(mode) {
    ui.micBtn.classList.remove("listening", "thinking", "speaking");
    if (mode === "listening") {
      ui.micBtn.classList.add("listening");
      ui.micBtn.innerHTML = "🎤";
    } else if (mode === "thinking") {
      ui.micBtn.classList.add("thinking");
      ui.micBtn.innerHTML = "💭";
    } else if (mode === "speaking") {
      ui.micBtn.classList.add("speaking");
      ui.micBtn.innerHTML = "🔊";
    } else {
      ui.micBtn.innerHTML = "🎤";
    }
  }

  function setProcessing(p) { isProcessing = p; }

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
  width:62px;height:62px;border-radius:50%;
  background:linear-gradient(135deg,#0C831F 0%,#0a6b18 100%);
  color:#fff;font-size:26px;border:none;cursor:pointer;
  box-shadow:0 6px 20px rgba(12,131,31,.35);
  display:flex;align-items:center;justify-content:center;
  z-index:1100;
  --vol-scale:1;
  transform:scale(var(--vol-scale));
  transition:background .2s, box-shadow .2s, transform .08s linear;
}
.voice-mic-btn:hover{filter:brightness(1.05);}
.voice-mic-btn:active{filter:brightness(.95);}

/* Listening state — green pulse */
.voice-mic-btn.listening{
  background:linear-gradient(135deg,#d23030 0%,#a71f1f 100%);
  box-shadow:0 6px 20px rgba(210,48,48,.5),
             0 0 0 8px rgba(210,48,48,.18);
  animation:vai-listen 1.6s infinite ease-in-out;
}
@keyframes vai-listen{
  0%,100%{box-shadow:0 6px 20px rgba(210,48,48,.5),0 0 0 8px rgba(210,48,48,.18);}
  50%{box-shadow:0 6px 20px rgba(210,48,48,.7),0 0 0 14px rgba(210,48,48,.08);}
}

/* Thinking state — blue */
.voice-mic-btn.thinking{
  background:linear-gradient(135deg,#3b7dd8 0%,#2956a3 100%);
  animation:vai-think 1s infinite linear;
}
@keyframes vai-think{
  0%{transform:scale(1) rotate(0deg);}
  100%{transform:scale(1) rotate(360deg);}
}

/* Speaking state — orange/yellow */
.voice-mic-btn.speaking{
  background:linear-gradient(135deg,#F0B91D 0%,#d49d10 100%);
  animation:vai-speak 0.8s infinite ease-in-out;
}
@keyframes vai-speak{
  0%,100%{box-shadow:0 6px 20px rgba(240,185,29,.5);}
  50%{box-shadow:0 6px 28px rgba(240,185,29,.85),0 0 0 12px rgba(240,185,29,.15);}
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
.voice-title .dot{width:8px;height:8px;border-radius:50%;background:#0C831F;display:inline-block;animation:vai-dot 1.5s infinite;}
@keyframes vai-dot{0%,100%{opacity:1;}50%{opacity:.4;}}
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
      <button class="voice-close" aria-label="End conversation">✕</button>
    </div>
    <div class="voice-status"></div>
    <div class="voice-error"></div>
    <div class="voice-transcript">Mic dabaiye aur baat shuru kariye...</div>
    <div class="voice-reply">नमस्ते 🙏 बात करने के लिए mic दबाइए।</div>
    <div class="voice-hint">Boliye natural — Hindi, Odia ya English mein</div>
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
