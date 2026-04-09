"""Gemini 3 Flash multimodal service for direct audio understanding."""

import os
import json
import base64
import logging
from typing import AsyncGenerator

import httpx

logger = logging.getLogger(__name__)

GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "")
GEMINI_MODEL = "gemini-3-flash-preview"
GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta"


class GeminiService:
    """Service for interacting with Gemini 3 Flash multimodal API."""

    def __init__(self):
        self.api_key = GEMINI_API_KEY
        self.model = GEMINI_MODEL

    def _get_url(self, method: str = "generateContent") -> str:
        return f"{GEMINI_BASE_URL}/models/{self.model}:{method}?key={self.api_key}"

    async def analyze_audio(
        self,
        audio_data: bytes,
        mime_type: str = "audio/webm",
        context: str = "",
    ) -> str:
        """
        Send audio directly to Gemini 3 Flash for multimodal understanding.
        Gemini natively understands audio - no STT conversion needed.
        Returns the AI analysis as text.
        """
        audio_b64 = base64.b64encode(audio_data).decode("utf-8")

        system_instruction = (
            "You are an expert AI interview copilot. You receive audio from a live interview. "
            "The audio may contain two speakers: the interviewer and the candidate. "
            "Listen carefully and:\n"
            "1. Transcribe what you hear, labeling speakers as [INTERVIEWER] and [CANDIDATE]\n"
            "2. If the interviewer asked a question, identify it\n"
            "3. If a question was asked, provide a concise, professional suggested answer\n\n"
            "Response format:\n"
            "[TRANSCRIPT]\n<transcribed text with speaker labels>\n\n"
            "If a question was detected:\n"
            "[QUESTION]: <the detected question>\n"
            "[ANSWER]: <concise professional answer, 3-6 sentences>\n\n"
            "If no question was detected:\n"
            "[NO_QUESTION]\n\n"
            "Rules for answers:\n"
            "- Be concise but thorough (3-6 sentences max)\n"
            "- Use the STAR method for behavioral questions\n"
            "- For technical questions, give clear, structured answers\n"
            "- Sound natural, not robotic"
        )

        contents = []

        # Add context if available
        user_parts = []
        if context:
            user_parts.append({"text": f"Previous conversation context:\n{context}\n\nNow analyze this new audio segment:"})

        # Add audio as inline data
        user_parts.append({
            "inlineData": {
                "mimeType": mime_type,
                "data": audio_b64,
            }
        })

        if not context:
            user_parts.insert(0, {"text": "Analyze this interview audio segment:"})

        contents.append({"role": "user", "parts": user_parts})

        payload = {
            "system_instruction": {
                "parts": [{"text": system_instruction}]
            },
            "contents": contents,
            "generationConfig": {
                "temperature": 0.7,
                "maxOutputTokens": 1024,
            },
        }

        url = self._get_url("generateContent")

        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                url,
                headers={"Content-Type": "application/json"},
                json=payload,
            )

            if response.status_code != 200:
                logger.error(f"Gemini API error: {response.status_code} - {response.text}")
                raise Exception(f"Gemini API error: {response.status_code} - {response.text}")

            result = response.json()
            candidates = result.get("candidates", [])
            if candidates:
                parts = candidates[0].get("content", {}).get("parts", [])
                text_parts = [p.get("text", "") for p in parts if "text" in p]
                return "".join(text_parts)
            return ""

    async def chat_stream(self, messages: list[dict]) -> AsyncGenerator[str, None]:
        """
        Stream text chat completions using Gemini 3 Flash.
        Used for text-based follow-up analysis.
        """
        url = self._get_url("streamGenerateContent")
        # Add alt=sse for server-sent events format
        url += "&alt=sse"

        # Convert OpenAI-style messages to Gemini format
        system_text = ""
        contents = []

        for msg in messages:
            role = msg.get("role", "user")
            content = msg.get("content", "")

            if role == "system":
                system_text = content
                continue

            gemini_role = "user" if role == "user" else "model"
            contents.append({
                "role": gemini_role,
                "parts": [{"text": content}],
            })

        payload = {
            "contents": contents,
            "generationConfig": {
                "temperature": 0.7,
                "maxOutputTokens": 1024,
            },
        }

        if system_text:
            payload["system_instruction"] = {
                "parts": [{"text": system_text}]
            }

        async with httpx.AsyncClient(timeout=60.0) as client:
            async with client.stream(
                "POST",
                url,
                headers={"Content-Type": "application/json"},
                json=payload,
            ) as response:
                if response.status_code != 200:
                    error_body = await response.aread()
                    logger.error(f"Gemini stream error: {response.status_code} - {error_body}")
                    raise Exception(f"Gemini stream error: {response.status_code}")

                async for line in response.aiter_lines():
                    if not line.strip():
                        continue
                    if line.startswith("data: "):
                        data_str = line[6:]
                        if data_str.strip() == "[DONE]":
                            break
                        try:
                            data = json.loads(data_str)
                            candidates = data.get("candidates", [])
                            if candidates:
                                parts = candidates[0].get("content", {}).get("parts", [])
                                for part in parts:
                                    text = part.get("text", "")
                                    if text:
                                        yield text
                        except json.JSONDecodeError:
                            continue

    async def chat(self, messages: list[dict]) -> str:
        """Non-streaming chat completion using Gemini 3 Flash."""
        url = self._get_url("generateContent")

        system_text = ""
        contents = []

        for msg in messages:
            role = msg.get("role", "user")
            content = msg.get("content", "")

            if role == "system":
                system_text = content
                continue

            gemini_role = "user" if role == "user" else "model"
            contents.append({
                "role": gemini_role,
                "parts": [{"text": content}],
            })

        payload = {
            "contents": contents,
            "generationConfig": {
                "temperature": 0.7,
                "maxOutputTokens": 1024,
            },
        }

        if system_text:
            payload["system_instruction"] = {
                "parts": [{"text": system_text}]
            }

        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.post(
                url,
                headers={"Content-Type": "application/json"},
                json=payload,
            )

            if response.status_code != 200:
                logger.error(f"Gemini chat error: {response.status_code} - {response.text}")
                raise Exception(f"Gemini chat error: {response.status_code}")

            result = response.json()
            candidates = result.get("candidates", [])
            if candidates:
                parts = candidates[0].get("content", {}).get("parts", [])
                text_parts = [p.get("text", "") for p in parts if "text" in p]
                return "".join(text_parts)
            return ""