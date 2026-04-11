import asyncio
import base64
from app.services.tts import _build_tts_payload, _get_api_key, TTS_API_URL, _pcm_to_wav
import httpx

async def generate_speech_chunked(text: str, language_code: str = "en-IN", voice_name: str = "Kore"):
    api_key = _get_api_key()
    headers = {
        "x-goog-api-key": api_key,
        "Content-Type": "application/json",
    }
    
    # Simple chunking by paragraph or length
    chunks = [text[i:i+500] for i in range(0, len(text), 500)]
    
    all_pcm_bytes = bytearray()
    
    async with httpx.AsyncClient(timeout=60.0) as client:
        for chunk in chunks:
            payload = _build_tts_payload(chunk, language_code, voice_name)
            response = await client.post(TTS_API_URL, json=payload, headers=headers)
            res_json = response.json()
            
            candidates = res_json.get("candidates", [])
            if not candidates: continue
            
            parts = candidates[0].get("content", {}).get("parts", [])
            for part in parts:
                inline_data = part.get("inlineData")
                if inline_data and "data" in inline_data:
                    audio_b64 = inline_data["data"]
                    mime_type = inline_data.get("mimeType", "")
                    
                    if "pcm" in mime_type or "L16" in mime_type:
                        all_pcm_bytes.extend(base64.b64decode(audio_b64))
    
    if not all_pcm_bytes:
        raise Exception("No audio generated")
        
    wav_bytes = _pcm_to_wav(bytes(all_pcm_bytes))
    return base64.b64encode(wav_bytes).decode('utf-8')

async def main():
    text = "This privacy policy is a huge document explaining that we will collect your email, your name, your IP address, your browser fingerprint, and we will sell it to third parties. " * 10
    res = await generate_speech_chunked(text)
    print("SUCCESS, length:", len(res))

asyncio.run(main())
