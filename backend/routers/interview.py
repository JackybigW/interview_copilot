"""API routes for Interview Copilot - structured resume/JD analysis (Gemini Pro),
streaming answer generation (Gemini Flash), session management, and Volcano STT proxy."""

import os
import json
import logging
import asyncio
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, WebSocket, WebSocketDisconnect, UploadFile, File
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from services.interview_sessions import Interview_sessionsService
from services.gemini_structured_service import (
    extract_resume_profile,
    extract_jd_profile,
    build_concise_context,
    refine_structured_profile,
)
from services.gemini_flash_service import generate_answer_stream
from services.file_parser_service import parse_file

import websockets

from services.volcano_stt_service import (
    get_ws_url,
    build_full_client_request,
    build_audio_request,
    parse_server_response,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/interview", tags=["interview"])


# ─── Request / Response Models ───────────────────────────────────────

class AnalyzeTextRequest(BaseModel):
    text: str
    type: str = "resume"  # "resume" or "jd"
    language: str = "en"


class AnalyzeStructuredResponse(BaseModel):
    """Returns both the structured JSON profile and a concise context string."""
    structured: dict
    concise_context: str


class GenerateAnswerRequest(BaseModel):
    question: str
    resume_context: str = ""
    jd_context: str = ""
    transcript_context: str = ""
    language: str = "en"


class RefineAnalysisRequest(BaseModel):
    current_structured: dict
    feedback: str
    type: str = "resume"  # "resume" or "jd"
    language: str = "en"


class CreateSessionRequest(BaseModel):
    resume_key: str = ""
    jd_key: str = ""
    resume_text: str = ""
    jd_text: str = ""
    resume_summary: str = ""
    jd_summary: str = ""
    language: str = "en"
    title: str = ""


class UpdateSessionRequest(BaseModel):
    transcript: str = ""
    ai_responses: str = ""
    status: str = ""
    duration: int = 0
    title: str = ""


# ─── Structured Resume / JD Analysis (Gemini Pro + LangChain) ────────

@router.post("/analyze-structured")
async def analyze_structured(request: AnalyzeTextRequest):
    """Extract structured profile from resume or JD using Gemini Pro with_structured_output.
    
    Returns both the full structured JSON and a concise context string
    optimized for Gemini Flash's context window.
    """
    try:
        if request.type == "resume":
            profile = await extract_resume_profile(request.text, request.language)
            concise = build_concise_context(resume=profile)
            return AnalyzeStructuredResponse(
                structured=profile.model_dump(),
                concise_context=concise,
            )
        else:
            profile = await extract_jd_profile(request.text, request.language)
            concise = build_concise_context(jd=profile)
            return AnalyzeStructuredResponse(
                structured=profile.model_dump(),
                concise_context=concise,
            )
    except Exception as e:
        logger.error(f"Structured analysis error: {e}")
        raise HTTPException(status_code=500, detail=f"Analysis failed: {str(e)}")


# ─── Refine Analysis (multi-turn with Gemini Pro) ───────────────────

@router.post("/refine-analysis")
async def refine_analysis(request: RefineAnalysisRequest):
    """Refine a structured profile based on user feedback using Gemini Pro.
    
    Accepts the current structured result and user's modification request,
    returns an updated structured profile. Supports multi-turn refinement.
    """
    try:
        result = await refine_structured_profile(
            current_structured=request.current_structured,
            feedback=request.feedback,
            doc_type=request.type,
            language=request.language,
        )
        concise = build_concise_context(
            resume=result if request.type == "resume" else None,
            jd=result if request.type == "jd" else None,
        )

        return AnalyzeStructuredResponse(
            structured=result.model_dump(),
            concise_context=concise,
        )
    except Exception as e:
        logger.error(f"Refine analysis error: {e}")
        raise HTTPException(status_code=500, detail=f"Refinement failed: {str(e)}")


# ─── Resume File Upload & Parse ──────────────────────────────────────

@router.post("/upload-resume")
async def upload_resume(file: UploadFile = File(...)):
    """Upload a resume file (PDF, DOCX, MD, TXT) and extract text.
    
    Returns the extracted text content which can then be sent to analyze-structured.
    """
    if not file.filename:
        raise HTTPException(status_code=400, detail="No file provided")

    # Validate file size (max 10MB)
    contents = await file.read()
    if len(contents) > 10 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File too large. Maximum size is 10MB.")

    try:
        text = parse_file(contents, file.filename)
        return {
            "text": text,
            "filename": file.filename,
            "size": len(contents),
            "chars_extracted": len(text),
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"File upload error: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to process file: {str(e)}")


# ─── Answer Generation - Gemini Flash Streaming ─────────────────────

@router.post("/generate-answer")
async def generate_answer(request: GenerateAnswerRequest):
    """Generate a personalized interview answer using Gemini Flash with native streaming.
    
    Uses the concise context from structured analysis for fast, relevant answers.
    """
    try:
        # Combine resume and JD context
        context_parts = []
        if request.resume_context:
            context_parts.append(request.resume_context)
        if request.jd_context:
            context_parts.append(request.jd_context)
        context = "\n\n".join(context_parts)

        async def generate():
            try:
                async for chunk in generate_answer_stream(
                    question=request.question,
                    context=context,
                    transcript_context=request.transcript_context,
                    language=request.language,
                ):
                    yield f"data: {chunk}\n\n"
                yield "data: [DONE]\n\n"
            except Exception as e:
                logger.error(f"Answer generation stream error: {e}")
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
        logger.error(f"Answer generation error: {e}")
        raise HTTPException(status_code=500, detail=f"Answer generation failed: {str(e)}")


# ─── Session CRUD (no auth required) ────────────────────────────────

ANONYMOUS_USER_ID = "anonymous"


@router.post("/sessions")
async def create_session(
    request: CreateSessionRequest,
    db: AsyncSession = Depends(get_db),
):
    """Create a new interview session (no auth required)."""
    try:
        service = Interview_sessionsService(db)
        session = await service.create(
            data={
                "resume_key": request.resume_key,
                "jd_key": request.jd_key,
                "resume_text": request.resume_text,
                "jd_text": request.jd_text,
                "resume_summary": request.resume_summary,
                "jd_summary": request.jd_summary,
                "language": request.language,
                "status": "preparing",
                "title": request.title or f"Interview {datetime.now().strftime('%Y-%m-%d %H:%M')}",
                "transcript": "[]",
                "ai_responses": "[]",
                "duration": 0,
                "created_at": datetime.now(),
            },
            user_id=ANONYMOUS_USER_ID,
        )
        return {"id": session.id, "status": "created"}
    except Exception as e:
        logger.error(f"Create session error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/sessions")
async def list_sessions(
    db: AsyncSession = Depends(get_db),
    skip: int = 0,
    limit: int = 20,
):
    """List interview sessions (no auth required)."""
    try:
        service = Interview_sessionsService(db)
        result = await service.get_list(
            skip=skip,
            limit=limit,
            user_id=ANONYMOUS_USER_ID,
            sort="-created_at",
        )
        return result
    except Exception as e:
        logger.error(f"List sessions error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/sessions/{session_id}")
async def get_session(
    session_id: int,
    db: AsyncSession = Depends(get_db),
):
    """Get a specific interview session."""
    try:
        service = Interview_sessionsService(db)
        session = await service.get_by_id(session_id, user_id=ANONYMOUS_USER_ID)
        if not session:
            raise HTTPException(status_code=404, detail="Session not found")
        return session
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Get session error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/sessions/{session_id}")
async def update_session(
    session_id: int,
    request: UpdateSessionRequest,
    db: AsyncSession = Depends(get_db),
):
    """Update an interview session."""
    try:
        service = Interview_sessionsService(db)
        update_data = {}
        if request.transcript:
            update_data["transcript"] = request.transcript
        if request.ai_responses:
            update_data["ai_responses"] = request.ai_responses
        if request.status:
            update_data["status"] = request.status
        if request.duration:
            update_data["duration"] = request.duration
        if request.title:
            update_data["title"] = request.title

        session = await service.update(session_id, update_data, user_id=ANONYMOUS_USER_ID)
        if not session:
            raise HTTPException(status_code=404, detail="Session not found")
        return {"status": "updated"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Update session error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/sessions/{session_id}")
async def delete_session(
    session_id: int,
    db: AsyncSession = Depends(get_db),
):
    """Delete an interview session."""
    try:
        service = Interview_sessionsService(db)
        success = await service.delete(session_id, user_id=ANONYMOUS_USER_ID)
        if not success:
            raise HTTPException(status_code=404, detail="Session not found")
        return {"status": "deleted"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Delete session error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ─── Volcano Engine STT WebSocket Proxy ─────────────────────────────

@router.websocket("/ws-stt")
async def websocket_stt_proxy(websocket: WebSocket):
    """
    WebSocket proxy for Volcano Engine streaming STT.
    Frontend sends audio chunks, backend forwards to Volcano and relays transcription results.
    
    Protocol:
    - Client sends JSON: {"type": "config", "language": "zh"} to initialize
    - Client sends binary audio frames
    - Client sends JSON: {"type": "stop"} to end
    - Server sends JSON: {"type": "transcript", "text": "...", "is_final": true/false}
    """
    await websocket.accept()

    volc_ws = None
    language = "zh-CN"

    try:
        # Wait for config message
        config_data = await websocket.receive_text()
        config = json.loads(config_data)
        language = config.get("language", "zh")

        # Connect to Volcano Engine
        ws_url = get_ws_url()
        volc_ws = await websockets.connect(ws_url)

        # Send full client request with config
        init_frame = build_full_client_request(language=language)
        await volc_ws.send(init_frame)

        # Wait for ACK
        ack_data = await asyncio.wait_for(volc_ws.recv(), timeout=10.0)
        ack_result = parse_server_response(ack_data)
        if ack_result["type"] == "error":
            await websocket.send_json({"type": "error", "text": f"Volcano init error: {ack_result.get('text', 'unknown')}"})
            return

        await websocket.send_json({"type": "ready"})

        # Task to receive from Volcano and forward to client
        async def relay_volcano_to_client():
            try:
                async for msg in volc_ws:
                    if isinstance(msg, bytes):
                        result = parse_server_response(msg)
                        if result["type"] == "result":
                            data = result.get("data", {})
                            payload_msg = data.get("payload_msg", data)
                            if isinstance(payload_msg, dict):
                                result_list = payload_msg.get("result", [])
                                if result_list:
                                    for item in result_list:
                                        text = item.get("text", "")
                                        is_definite = item.get("definite", False)
                                        if text:
                                            await websocket.send_json({
                                                "type": "transcript",
                                                "text": text,
                                                "is_final": is_definite,
                                            })
                        elif result["type"] == "error":
                            await websocket.send_json({
                                "type": "error",
                                "text": result.get("text", "STT error"),
                            })
            except websockets.exceptions.ConnectionClosed:
                pass
            except Exception as e:
                logger.error(f"Volcano relay error: {e}")

        relay_task = asyncio.create_task(relay_volcano_to_client())

        # Main loop: receive from client and forward to Volcano
        try:
            while True:
                message = await websocket.receive()

                if "bytes" in message and message["bytes"]:
                    audio_frame = build_audio_request(message["bytes"], is_last=False)
                    await volc_ws.send(audio_frame)

                elif "text" in message and message["text"]:
                    data = json.loads(message["text"])
                    if data.get("type") == "stop":
                        last_frame = build_audio_request(b"", is_last=True)
                        await volc_ws.send(last_frame)
                        await asyncio.sleep(1.0)
                        break
        except WebSocketDisconnect:
            pass

        relay_task.cancel()
        try:
            await relay_task
        except asyncio.CancelledError:
            pass

    except Exception as e:
        logger.error(f"WebSocket STT proxy error: {e}")
        try:
            await websocket.send_json({"type": "error", "text": str(e)})
        except Exception:
            pass
    finally:
        if volc_ws:
            try:
                await volc_ws.close()
            except Exception:
                pass
