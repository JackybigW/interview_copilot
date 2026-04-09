"""API routes for MiniMax STT and LLM services."""

import logging
from typing import Optional

from fastapi import APIRouter, HTTPException, UploadFile, File, Form
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from services.minimax_service import MinimaxService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/minimax", tags=["minimax"])

minimax_service = MinimaxService()


@router.post("/transcribe")
async def transcribe_audio(
    file: UploadFile = File(...),
    mime_type: Optional[str] = Form("audio/webm"),
):
    """Transcribe audio using MiniMax speech-2.8-turbo."""
    try:
        audio_data = await file.read()
        if len(audio_data) == 0:
            raise HTTPException(status_code=400, detail="Empty audio data")

        text = await minimax_service.transcribe_audio(audio_data, mime_type or "audio/webm")
        return {"text": text}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Transcription error: {e}")
        raise HTTPException(status_code=500, detail=f"Transcription failed: {str(e)}")


class ChatMessage(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    messages: list[ChatMessage]


@router.post("/chat")
async def chat_stream(request: ChatRequest):
    """Stream chat completions using MiniMax minimax-m2.7-highspeed."""
    try:
        messages = [{"role": m.role, "content": m.content} for m in request.messages]

        async def generate():
            try:
                async for chunk in minimax_service.chat_stream(messages):
                    yield f"data: {chunk}\n\n"
                yield "data: [DONE]\n\n"
            except Exception as e:
                logger.error(f"Chat stream error: {e}")
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
        logger.error(f"Chat error: {e}")
        raise HTTPException(status_code=500, detail=f"Chat failed: {str(e)}")