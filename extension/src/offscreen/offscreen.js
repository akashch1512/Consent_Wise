"use strict";

/**
 * offscreen.js — Runs in the hidden offscreen document.
 * Records mic audio with MediaRecorder and sends it to the backend
 * /api/stt endpoint for transcription (no browser speech API dependency).
 */

// Backend wiring comes from config.js (loaded first in offscreen.html).
const STT_URL = ConsentWise.API.stt;

let mediaRecorder = null;
let audioChunks = [];
let stream = null;
let isListening = false;
let currentLang = "en-IN";

// Real silence detection (BUG-5): stop after a pause in speech, not a hard cap.
let audioCtx = null;
let analyser = null;
let silenceRAF = null;
let lastVoiceAt = 0;
let recordingStartedAt = 0;
const SILENCE_HANG_MS = 1600; // stop this long after the last voiced frame
const MAX_RECORDING_MS = 30000; // absolute ceiling
const VOICE_RMS_THRESHOLD = 0.012;

function sendToPopup(payload) {
  chrome.runtime.sendMessage({ target: "popup", ...payload });
}

async function startRecognition(lang) {
  if (isListening) return;
  currentLang = lang || "en-IN";

  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch (err) {
    const errorType = err.name === "NotAllowedError" ? "not-allowed" : "not-supported";
    sendToPopup({ type: "stt-error", error: errorType });
    return;
  }

  audioChunks = [];

  // Prefer webm/opus (best quality + size); fall back to whatever is supported
  const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
    ? "audio/webm;codecs=opus"
    : MediaRecorder.isTypeSupported("audio/webm")
    ? "audio/webm"
    : "";

  const options = mimeType ? { mimeType } : {};

  try {
    mediaRecorder = new MediaRecorder(stream, options);
  } catch (e) {
    mediaRecorder = new MediaRecorder(stream);
  }

  mediaRecorder.ondataavailable = (e) => {
    if (e.data && e.data.size > 0) {
      audioChunks.push(e.data);
    }
  };

  mediaRecorder.onstart = () => {
    isListening = true;
    recordingStartedAt = performance.now();
    lastVoiceAt = recordingStartedAt;
    sendToPopup({ type: "stt-started" });
    startSilenceWatch(stream);
  };

  mediaRecorder.onstop = async () => {
    stopSilenceWatch();
    isListening = false;

    if (stream) {
      stream.getTracks().forEach((t) => t.stop());
      stream = null;
    }

    if (audioChunks.length === 0) {
      sendToPopup({ type: "stt-ended" });
      return;
    }

    const blob = new Blob(audioChunks, {
      type: mediaRecorder.mimeType || "audio/webm",
    });
    audioChunks = [];

    // Skip very short clips (< 0.5 KB) — likely just silence/noise
    if (blob.size < 512) {
      sendToPopup({ type: "stt-ended" });
      return;
    }

    // Convert blob to base64 and send to backend
    try {
      const base64Audio = await blobToBase64(blob);
      const response = await fetch(STT_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          audio_base64: base64Audio,
          mime_type: mediaRecorder.mimeType || "audio/webm",
          language: currentLang,
        }),
      });

      if (!response.ok) {
        throw new Error(`STT backend error: ${response.status}`);
      }

      const data = await response.json();
      if (data.transcript && data.transcript.trim()) {
        sendToPopup({ type: "stt-result", transcript: data.transcript.trim(), isFinal: true });
      }
    } catch (err) {
      console.error("[Offscreen STT] Error:", err);
      sendToPopup({ type: "stt-error", error: "network" });
    }

    sendToPopup({ type: "stt-ended" });
  };

  mediaRecorder.onerror = (event) => {
    console.error("[Offscreen STT] MediaRecorder error:", event.error);
    isListening = false;
    sendToPopup({ type: "stt-error", error: "audio-capture" });
    sendToPopup({ type: "stt-ended" });
  };

  // Collect chunks every 250ms
  mediaRecorder.start(250);
}

function stopRecognition() {
  stopSilenceWatch();
  if (mediaRecorder && isListening) {
    try {
      mediaRecorder.stop();
    } catch (_) {}
  } else if (stream) {
    stream.getTracks().forEach((t) => t.stop());
    stream = null;
    isListening = false;
    sendToPopup({ type: "stt-ended" });
  }
}

function startSilenceWatch(mediaStream) {
  try {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const src = audioCtx.createMediaStreamSource(mediaStream);
    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 512;
    src.connect(analyser);
  } catch {
    // Web Audio unavailable — fall back to the max ceiling only.
    analyser = null;
  }
  const buf = analyser ? new Float32Array(analyser.fftSize) : null;

  const tick = () => {
    if (!isListening) return;
    const now = performance.now();

    if (analyser) {
      analyser.getFloatTimeDomainData(buf);
      let sum = 0;
      for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
      const rms = Math.sqrt(sum / buf.length);
      if (rms > VOICE_RMS_THRESHOLD) lastVoiceAt = now;
      if (now - lastVoiceAt > SILENCE_HANG_MS && now - recordingStartedAt > 700) {
        stopRecognition();
        return;
      }
    }
    if (now - recordingStartedAt > MAX_RECORDING_MS) {
      stopRecognition();
      return;
    }
    silenceRAF = requestAnimationFrame(tick);
  };
  silenceRAF = requestAnimationFrame(tick);
}

function stopSilenceWatch() {
  if (silenceRAF) cancelAnimationFrame(silenceRAF);
  silenceRAF = null;
  if (audioCtx) {
    audioCtx.close().catch(() => {});
    audioCtx = null;
  }
  analyser = null;
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      // result is "data:<mime>;base64,<data>" — strip prefix
      const base64 = reader.result.split(",")[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

// Listen for commands from the service worker (relayed from popup)
chrome.runtime.onMessage.addListener((message, sender) => {
  if (!sender || sender.id !== chrome.runtime.id) return;
  if (message.target !== "offscreen") return;

  if (message.type === "stt-start") {
    startRecognition(message.lang);
  } else if (message.type === "stt-stop") {
    stopRecognition();
  }
});
