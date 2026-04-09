"""MiniMax API service for STT and LLM capabilities."""

import os
import json
import logging
from typing import AsyncGenerator

import httpx

logger = logging.getLogger(__name__)

MINIMAX_API_KEY = os.environ.get("MINIMAX_API_KEY", "")
MINIMAX_BASE_URL = "https://api.minimax.chat/v1"

STT_MODEL = "speech-2.8-turbo"
LLM_MODEL = "minimax-m2.7-highspeed"


class MinimaxService:
    """Service for interacting with MiniMax API."""

    def __init__(self):
        self.api_key = MINIMAX_API_KEY
        self.base_url = MINIMAX_BASE_URL
        self.headers = {
            "Authorization": f"Bearer {self.api_key}",
        }

    async def transcribe_audio(self, audio_data: bytes, mime_type: str = "audio/webm") -> str:
        """
        Transcribe audio using MiniMax speech-2.8-turbo model.
        Uses the OpenAI-compatible /audio/transcriptions endpoint.
        """
        url = f"{self.base_url}/audio/transcriptions"

        # Determine file extension from mime type
        ext_map = {
            "audio/webm": "webm",
            "audio/wav": "wav",
            "audio/mp3": "mp3",
            "audio/mpeg": "mp3",
            "audio/ogg": "ogg",
            "audio/mp4": "mp4",
        }
        ext = ext_map.get(mime_type, "webm")

        async with httpx.AsyncClient(timeout=30.0) as client:
            files = {
                "file": (f"audio.{ext}", audio_data, mime_type),
            }
            data = {
                "model": STT_MODEL,
            }
            response = await client.post(
                url,
                headers={"Authorization": f"Bearer {self.api_key}"},
                files=files,
                data=data,
            )

            if response.status_code != 200:
                logger.error(f"MiniMax STT error: {response.status_code} - {response.text}")
                raise Exception(f"MiniMax STT error: {response.status_code} - {response.text}")

            result = response.json()
            return result.get("text", "")

    async def chat_stream(self, messages: list[dict]) -> AsyncGenerator[str, None]:
        """
        Stream chat completions using MiniMax minimax-m2.7-highspeed model.
        Uses OpenAI-compatible /chat/completions endpoint with streaming.
        """
        url = f"{self.base_url}/chat/completions"

        payload = {
            "model": LLM_MODEL,
            "messages": messages,
            "stream": True,
            "temperature": 0.7,
            "max_tokens": 1024,
        }

        async with httpx.AsyncClient(timeout=60.0) as client:
            async with client.stream(
                "POST",
                url,
                headers={
                    "Authorization": f"Bearer {self.api_key}",
                    "Content-Type": "application/json",
                },
                json=payload,
            ) as response:
                if response.status_code != 200:
                    error_body = await response.aread()
                    logger.error(f"MiniMax LLM error: {response.status_code} - {error_body}")
                    raise Exception(f"MiniMax LLM error: {response.status_code}")

                async for line in response.aiter_lines():
                    if not line.strip():
                        continue
                    if line.startswith("data: "):
                        data_str = line[6:]
                        if data_str.strip() == "[DONE]":
                            break
                        try:
                            data = json.loads(data_str)
                            choices = data.get("choices", [])
                            if choices:
                                delta = choices[0].get("delta", {})
                                content = delta.get("content", "")
                                if content:
                                    yield content
                        except json.JSONDecodeError:
                            continue

    async def chat(self, messages: list[dict]) -> str:
        """
        Non-streaming chat completion.
        """
        url = f"{self.base_url}/chat/completions"

        payload = {
            "model": LLM_MODEL,
            "messages": messages,
            "stream": False,
            "temperature": 0.7,
            "max_tokens": 1024,
        }

        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.post(
                url,
                headers={
                    "Authorization": f"Bearer {self.api_key}",
                    "Content-Type": "application/json",
                },
                json=payload,
            )

            if response.status_code != 200:
                logger.error(f"MiniMax LLM error: {response.status_code} - {response.text}")
                raise Exception(f"MiniMax LLM error: {response.status_code}")

            result = response.json()
            choices = result.get("choices", [])
            if choices:
                return choices[0].get("message", {}).get("content", "")
            return ""