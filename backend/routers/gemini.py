"""API routes for Gemini 3 Flash multimodal audio understanding."""

import logging
from typing import Optional

from fastapi import APIRouter, HTTPException, UploadFile, File, Form
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from services.gemini_service import GeminiService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/gemini", tags=["gemini"])

gemini_service = GeminiService()


@router.post("/analyze-audio")
async def analyze_audio(
    file: UploadFile = File(...),
    mime_type: Optional[str] = Form("audio/webm"),
    context: Optional[str] = Form(""),
):
    """
    Send audio directly to Gemini 3 Flash for multimodal understanding.
    No STT conversion needed - Gemini understands audio natively.
    Returns transcription + question detection + suggested answer.
    """
    try:
        audio_data = await file.read()
        if len(audio_data) == 0:
            raise HTTPException(status_code=400, detail="Empty audio data")

        result = await gemini_service.analyze_audio(
            audio_data,
            mime_type or "audio/webm",
            context or "",
        )
        return {"result": result}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Gemini audio analysis error: {e}")
        raise HTTPException(status_code=500, detail=f"Audio analysis failed: {str(e)}")


class ChatMessage(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    messages: list[ChatMessage]


@router.post("/chat")
async def chat_stream(request: ChatRequest):
    """Stream chat completions using Gemini 3 Flash."""
    try:
        messages = [{"role": m.role, "content": m.content} for m in request.messages]

        async def generate():
            try:
                async for chunk in gemini_service.chat_stream(messages):
                    yield f"data: {chunk}\n\n"
                yield "data: [DONE]\n\n"
            except Exception as e:
                logger.error(f"Gemini chat stream error: {e}")
                yield f"data: [ERROR] {str(e)}\n\n"

        return StreamingResponse(
            generate(),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
                "X-Accel-Buffering": "no",
            },
        )
    except Exception as e:
        logger.error(f"Gemini chat error: {e}")
        raise HTTPException(status_code=500, detail=f"Chat failed: {str(e)}")