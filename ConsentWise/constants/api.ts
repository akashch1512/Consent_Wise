// ─── ConsentWise API Configuration ───────────────────────────────────────────
// Change BACKEND_URL to your machine's local IP if testing on a real device.
// Example: 'http://192.168.1.10:8000'
export const BACKEND_URL = 'http://localhost:8000';

export const API = {
  analyzeDocument: `${BACKEND_URL}/api/analyze-document`,
  extensionAnalyze: `${BACKEND_URL}/api/extension/analyze`,
  chat: `${BACKEND_URL}/api/chat`,
  tts: `${BACKEND_URL}/api/tts`,
  quiz: `${BACKEND_URL}/api/generate-quiz`,
};
