"use strict";

// Backend wiring comes from config.js (loaded first in index.html).
const PROCESS_IMAGE_ENDPOINT = ConsentWise.API.analyzeDocument;
const ACCEPTED_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
  "application/pdf",
]);
const FINANCIAL_TERMS = [
  "interest rate",
  "apr",
  "annual percentage rate",
  "emi",
  "loan",
  "credit score",
  "credit limit",
  "late fee",
  "processing fee",
  "penalty",
  "collateral",
  "repayment",
  "minimum due",
  "outstanding balance",
  "principal",
  "consent",
  "kyc",
  "debit",
  "credit",
  "upi",
  "mandate",
  "autopay",
  "charge",
  "subscription",
  "tenure",
  "default",
  "overdue",
  "disbursement",
  "insurance",
  "gst",
];

const imageInput = document.getElementById("image-input");
const dropzone = document.getElementById("dropzone");
const fileName = document.getElementById("file-name");
const previewFrame = document.getElementById("preview-frame");
const previewImage = document.getElementById("preview-image");
const removeImageButton = document.getElementById("remove-image");
const analyzeButton = document.getElementById("analyze-button");
const clearButton = document.getElementById("clear-button");
const statusBanner = document.getElementById("status-banner");
const extractedText = document.getElementById("extracted-text");
const summaryText = document.getElementById("summary-text");
const resultBadge = document.getElementById("result-badge");

let selectedFile = null;
let previewUrl = "";

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function setStatus(message, variant = "info") {
  statusBanner.textContent = message;
  statusBanner.className = `status-banner visible ${variant}`;
}

function clearStatus() {
  statusBanner.textContent = "";
  statusBanner.className = "status-banner";
}

function setResultBadge(label, variant = "neutral") {
  resultBadge.textContent = label;
  resultBadge.className = `panel-badge ${variant}`;
}

function setAnalyzeLoading(isLoading) {
  analyzeButton.disabled = isLoading || !selectedFile;
  analyzeButton.classList.toggle("loading", isLoading);
}

function resetPreview() {
  if (previewUrl) {
    URL.revokeObjectURL(previewUrl);
    previewUrl = "";
  }

  previewImage.removeAttribute("src");
  previewFrame.classList.remove("has-image");
}

function resetResponse() {
  extractedText.textContent = "Upload and analyze an image to view extracted content here.";
  summaryText.textContent = "A simplified explanation will appear here after the backend responds.";
  setResultBadge("Waiting", "neutral");
}

function resetSelection(options = {}) {
  const { keepStatus = false } = options;

  selectedFile = null;
  imageInput.value = "";
  fileName.textContent = "No image selected";
  removeImageButton.disabled = true;
  analyzeButton.disabled = true;
  resetPreview();

  if (!keepStatus) {
    clearStatus();
  }
}

function clearAll() {
  resetSelection();
  resetResponse();
}

function updatePreview(file) {
  resetPreview();

  previewUrl = URL.createObjectURL(file);
  previewImage.src = previewUrl;
  previewFrame.classList.add("has-image");
}

function renderHighlightedText(element, text) {
  const baseText = String(text || "").trim();
  if (!baseText) {
    element.textContent = "No content returned by the backend.";
    return;
  }

  let html = escapeHtml(baseText);

  FINANCIAL_TERMS
    .slice()
    .sort((left, right) => right.length - left.length)
    .forEach((term) => {
      const pattern = new RegExp(`\\b(${escapeRegExp(term)})\\b`, "gi");
      html = html.replace(pattern, '<mark class="term-highlight">$1</mark>');
    });

  element.innerHTML = html.replace(/\n/g, "<br />");
}

function normalizeResponse(data) {
  const extracted =
    data.extracted_text ||
    data.text ||
    data.ocr_text ||
    data.result ||
    data.content ||
    "";

  const summary =
    data.simplified_explanation ||
    data.summary ||
    data.explanation ||
    data.message ||
    "";

  return {
    extractedText: extracted,
    summaryText: summary,
  };
}

function validateFile(file) {
  if (!file) {
    setStatus("Please select an image before analyzing the document.", "error");
    return false;
  }

  if (!ACCEPTED_TYPES.has(file.type)) {
    setStatus("Supported files: JPG, PNG, WEBP, HEIC, or PDF.", "error");
    return false;
  }

  return true;
}

function handleSelectedFile(file) {
  if (!validateFile(file)) {
    resetSelection({ keepStatus: true });
    return;
  }

  selectedFile = file;
  fileName.textContent = file.name;
  removeImageButton.disabled = false;
  analyzeButton.disabled = false;
  updatePreview(file);
  setStatus("Image ready for analysis. Review the preview, then submit it to the backend.", "info");
  setResultBadge("Ready", "neutral");
}

async function analyzeDocument() {
  if (!selectedFile) {
    setStatus("Please upload an image before calling the backend.", "error");
    return;
  }

  clearStatus();
  setAnalyzeLoading(true);
  setResultBadge("Processing", "neutral");
  extractedText.textContent = "Reading image content...";
  summaryText.textContent = "Preparing simplified explanation...";

  const formData = new FormData();
  formData.append("file", selectedFile);

  try {
    const response = await fetch(PROCESS_IMAGE_ENDPOINT, {
      method: "POST",
      body: formData,
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.detail || data.message || "Image processing failed. Please try again.");
    }

    const normalized = normalizeResponse(data);
    renderHighlightedText(extractedText, normalized.extractedText);
    renderHighlightedText(summaryText, normalized.summaryText || "The backend did not provide a simplified explanation.");
    setStatus("Document analyzed successfully. Review the extracted text and summary below.", "success");
    setResultBadge("Complete", "success");
  } catch (error) {
    resetResponse();
    setStatus(error.message || "Something went wrong while processing the image.", "error");
    setResultBadge("Error", "error");
  } finally {
    setAnalyzeLoading(false);
  }
}

function handleDrop(event) {
  event.preventDefault();
  dropzone.classList.remove("dragover");

  const [file] = event.dataTransfer.files;
  handleSelectedFile(file);
}

dropzone.addEventListener("dragover", (event) => {
  event.preventDefault();
  dropzone.classList.add("dragover");
});

dropzone.addEventListener("dragleave", () => {
  dropzone.classList.remove("dragover");
});

dropzone.addEventListener("drop", handleDrop);

imageInput.addEventListener("change", (event) => {
  const [file] = event.target.files;
  handleSelectedFile(file);
});

removeImageButton.addEventListener("click", () => {
  resetSelection();
  setStatus("Image removed. You can upload a new document anytime.", "info");
  resetResponse();
});

clearButton.addEventListener("click", clearAll);
analyzeButton.addEventListener("click", analyzeDocument);

resetResponse();
