"use strict";

/**
 * offscreen.js — Runs in the hidden offscreen document.
 * Owns the SpeechRecognition instance (mic access works here).
 * Communicates with popup.js via the service worker.
 */

const SpeechRecognitionCtor =
  window.SpeechRecognition || window.webkitSpeechRecognition || null;

let recognition = null;
let isListening = false;

function sendToPopup(payload) {
  chrome.runtime.sendMessage({ target: "popup", ...payload });
}

function startRecognition(lang) {
  if (!SpeechRecognitionCtor) {
    sendToPopup({ type: "stt-error", error: "not-supported" });
    return;
  }

  if (isListening) return;

  recognition = new SpeechRecognitionCtor();
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.lang = lang || "en-IN";

  recognition.onstart = () => {
    isListening = true;
    sendToPopup({ type: "stt-started" });
  };

  recognition.onresult = (event) => {
    let transcript = "";
    for (let i = event.resultIndex; i < event.results.length; i++) {
      transcript += event.results[i][0].transcript;
    }
    const isFinal = event.results[event.results.length - 1].isFinal;
    sendToPopup({ type: "stt-result", transcript: transcript.trim(), isFinal });
  };

  recognition.onerror = (event) => {
    isListening = false;
    sendToPopup({ type: "stt-error", error: event.error });
  };

  recognition.onend = () => {
    isListening = false;
    sendToPopup({ type: "stt-ended" });
  };

  recognition.start();
}

function stopRecognition() {
  if (recognition && isListening) {
    recognition.stop();
  }
}

// Listen for commands from background.js (relayed from popup)
chrome.runtime.onMessage.addListener((message) => {
  if (message.target !== "offscreen") return;

  if (message.type === "stt-start") {
    startRecognition(message.lang);
  } else if (message.type === "stt-stop") {
    stopRecognition();
  }
});
