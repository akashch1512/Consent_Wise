# ConsentGuard AI - MIT CSN Hackathon

ConsentGuard AI is a powerful Chrome extension designed to help users navigate and understand complex privacy policies with ease. By analyzing webpage content and privacy agreements in real-time, it provides actionable insights, risk scores, and summaries to ensure users know exactly what they are consenting to.

## Features

- **Privacy Policy Analysis & Risk Scoring**: Get immediate, AI-driven insights and a risk score for the website's privacy policy.
- **Multilingual Support**: A centralized, robust language engine supporting multiple languages for a fully localized user experience ("0 English" needed).
- **Interactive Chat Assistant**: Ask specific questions regarding the privacy policy and get contextual answers powered by Google's Gemini.
- **Test Your Knowledge (Quiz Mode)**: Generate language-aware interactive quizzes directly from the document to test your understanding of the policy.
- **Voice Capabilities**: Interact hands-free with Speech-to-Text (STT) for asking questions, and Text-to-Speech (TTS) for listening to explanations.
- **Modern User Interface**: Sleek, responsive, and dynamic UI that seamlessly integrates into your browsing experience.

## Installation Guide

Follow these steps to get both the backend API and the Chrome extension up and running locally.

### 1. Prerequisites
- [Python 3.8+](https://www.python.org/downloads/)
- [Google Chrome](https://www.google.com/chrome/) or a Chromium-based browser
- Obtain a Gemini API Key

### 2. Clone the Repository
```bash
git clone <repository-url>
cd T28_Team_Endra
```

### 3. Backend Setup
The backend is built with FastAPI and handles the AI analysis, STT, and robust data processing.

```bash
# Navigate to the backend directory
cd backend

# Create a virtual environment
python -m venv venv

# Activate the virtual environment
# On Linux/macOS:
source venv/bin/activate
# On Windows:
# venv\Scripts\activate

# Install dependencies 
# (Assuming a requirements.txt exists; install relevant packages like fastapi, uvicorn, google-generativeai, pydub, SpeechRecognition)
pip install -r requirements.txt

# Create a .env file and add your configuration (e.g., Gemini API key, CORS origins)
# Example: GEMINI_API_KEY=your_api_key_here

# Start the FastAPI server
uvicorn app.main:app --reload
```
*The backend server should now be running on `http://127.0.0.1:8000`.*

### 4. Extension Setup
Load the extension into your Chrome browser.

1. Open a new tab in Chrome and navigate to `chrome://extensions/`.
2. Turn on **Developer mode** by toggling the switch in the top right corner.
3. Click the **Load unpacked** button in the top left.
4. Select the `extension` folder located within the cloned repository (`T28_Team_Endra/extension`).
5. Pin the ConsentGuard AI extension to your toolbar for easy access.

## Usage
Simply click on the ConsentGuard AI extension icon while browsing any webpage containing a privacy policy to begin the analysis. Use the integrated chat, voice features, and quizzes to deep-dive into the terms!