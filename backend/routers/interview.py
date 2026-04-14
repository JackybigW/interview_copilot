"""API routes for Interview Copilot - structured resume/JD analysis (Gemini Flash),
streaming answer generation (Gemini Flash), session management, and Volcano STT proxy."""

import os
import json
import logging
import asyncio
import time
import math
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, WebSocket, WebSocketDisconnect, UploadFile, File
from fastapi.responses import StreamingResponse
from typing import Optional

from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from models.interview_sessions import prepare_interview_session_payload
from services.interview_sessions import Interview_sessionsService
from services.gemini_structured_service import (
    extract_resume_profile,
    extract_jd_profile,
    build_concise_context,
    refine_structured_profile,
)
from services.gemini_flash_service import (
    generate_answer_stream,
    detect_question_and_answer_stream,
    extract_question_from_detected_content,
    GEMINI_FLASH_MODEL,
)
from services.file_parser_service import parse_file

import websockets

from services.volcano_stt_service import (
    get_ws_url,
    get_ws_connect_config,
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


@router.post("/detect-question")
async def detect_question(request: GenerateAnswerRequest):
    """Detect a complete interviewer question from recent transcript context."""
    try:
        context_parts = []
        if request.resume_context:
            context_parts.append(request.resume_context)
        if request.jd_context:
            context_parts.append(request.jd_context)
        context = "\n\n".join(context_parts)

        chunks: list[str] = []
        async for chunk in detect_question_and_answer_stream(
            transcript=request.transcript_context,
            context=context,
            language=request.language,
        ):
            chunks.append(chunk)

        detected_question = extract_question_from_detected_content("".join(chunks))
        return {"question": detected_question}
    except Exception as e:
        logger.error(f"Question detection error: {e}")
        raise HTTPException(status_code=500, detail=f"Question detection failed: {str(e)}")


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
    company: Optional[str] = None
    job_title: Optional[str] = None
    title: Optional[str] = None


class UpdateSessionRequest(BaseModel):
    transcript: str = ""
    ai_responses: str = ""
    status: str = ""
    duration: int = 0
    title: Optional[str] = None


def _iter_transcript_chunks(result: dict) -> list[dict]:
    """Normalize Volcano transcript payloads across response shapes."""
    data = result.get("data", {})
    payload_msg = data.get("payload_msg")

    chunks: list[dict] = []

    if isinstance(payload_msg, dict):
        payload_results = payload_msg.get("result", [])
        if isinstance(payload_results, list):
            chunks.extend(item for item in payload_results if isinstance(item, dict))

    direct_result = data.get("result")
    if isinstance(direct_result, dict):
        chunks.append(direct_result)
    elif isinstance(direct_result, list):
        chunks.extend(item for item in direct_result if isinstance(item, dict))

    return chunks


def _describe_pcm16(audio_data: bytes) -> dict:
    """Return lightweight stats for signed 16-bit PCM audio."""
    if len(audio_data) < 2:
        return {
            "samples": 0,
            "peak": 0,
            "rms": 0.0,
            "nonzero_ratio": 0.0,
        }

    sample_count = len(audio_data) // 2
    total_sq = 0.0
    nonzero_count = 0
    peak = 0

    for idx in range(0, sample_count * 2, 2):
        sample = int.from_bytes(audio_data[idx : idx + 2], "little", signed=True)
        magnitude = abs(sample)
        peak = max(peak, magnitude)
        total_sq += sample * sample
        if sample != 0:
            nonzero_count += 1

    rms = math.sqrt(total_sq / sample_count) if sample_count else 0.0
    return {
        "samples": sample_count,
        "peak": peak,
        "rms": round(rms, 2),
        "nonzero_ratio": round(nonzero_count / sample_count, 4) if sample_count else 0.0,
    }


# ─── Structured Resume / JD Analysis (Gemini Flash + LangChain) ────────

@router.post("/analyze-structured")
async def analyze_structured(request: AnalyzeTextRequest):
    """Extract structured profile from resume or JD using Gemini Flash with_structured_output.
    
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


# ─── Refine Analysis (multi-turn with Gemini Flash) ───────────────────

@router.post("/refine-analysis")
async def refine_analysis(request: RefineAnalysisRequest):
    """Refine a structured profile based on user feedback using Gemini Flash.
    
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
        question_chars = len(request.question)
        context_chars = len(context)
        transcript_chars = len(request.transcript_context)
        request_type = "generate_answer" if request.question.strip() else "detect_question_and_answer"
        logger.info(
            "copilot_answer request_type=%s model=%s question_chars=%d context_chars=%d transcript_chars=%d language=%s",
            request_type,
            GEMINI_FLASH_MODEL,
            question_chars,
            context_chars,
            transcript_chars,
            request.language,
        )

        async def generate():
            start = time.perf_counter()
            first_chunk_ms: float | None = None
            chunk_count = 0
            try:
                if request.question.strip():
                    stream = generate_answer_stream(
                        question=request.question,
                        context=context,
                        transcript_context=request.transcript_context,
                        language=request.language,
                    )
                else:
                    stream = detect_question_and_answer_stream(
                        transcript=request.transcript_context,
                        context=context,
                        language=request.language,
                    )

                async for chunk in stream:
                    if first_chunk_ms is None:
                        first_chunk_ms = (time.perf_counter() - start) * 1000
                        logger.info(
                            "copilot_answer first_chunk request_type=%s model=%s ttfc_ms=%.1f question_chars=%d context_chars=%d transcript_chars=%d",
                            request_type,
                            GEMINI_FLASH_MODEL,
                            first_chunk_ms,
                            question_chars,
                            context_chars,
                            transcript_chars,
                        )
                    chunk_count += 1
                    yield f"data: {chunk}\n\n"
                yield "data: [DONE]\n\n"
            except Exception as e:
                logger.error(
                    "copilot_answer stream_error model=%s ttfc_ms=%s error=%s",
                    GEMINI_FLASH_MODEL,
                    f"{first_chunk_ms:.1f}" if first_chunk_ms is not None else "n/a",
                    e,
                )
                yield f"data: [ERROR] {str(e)}\n\n"
            finally:
                total_ms = (time.perf_counter() - start) * 1000
                logger.info(
                    "copilot_answer complete request_type=%s model=%s total_ms=%.1f ttfc_ms=%s chunks=%d question_chars=%d context_chars=%d transcript_chars=%d",
                    request_type,
                    GEMINI_FLASH_MODEL,
                    total_ms,
                    f"{first_chunk_ms:.1f}" if first_chunk_ms is not None else "n/a",
                    chunk_count,
                    question_chars,
                    context_chars,
                    transcript_chars,
                )

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
        now = datetime.now()
        payload = prepare_interview_session_payload(
            {
                "resume_key": request.resume_key,
                "jd_key": request.jd_key,
                "resume_text": request.resume_text,
                "jd_text": request.jd_text,
                "resume_summary": request.resume_summary,
                "jd_summary": request.jd_summary,
                "language": request.language,
                "company": request.company,
                "job_title": request.job_title,
                "title": request.title,
                "status": "preparing",
                "transcript": "[]",
                "ai_responses": "[]",
                "duration": 0,
                "created_at": now,
            }
        )
        session = await service.create(
            data=payload,
            user_id=ANONYMOUS_USER_ID,
        )
        return {
            "id": session.id,
            "status": "created",
            "title": session.title,
            "company": session.company,
            "job_title": session.job_title,
            "created_at": session.created_at,
        }
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
    request_sequence = 1
    audio_frame_count = 0
    transcript_event_count = 0
    empty_result_count = 0

    try:
        # Wait for config message
        config_data = await websocket.receive_text()
        config = json.loads(config_data)
        language = config.get("language", "zh")

        # Connect to Volcano Engine
        ws_url = get_ws_url()
        # Bypass host-level proxy auto-detection for upstream STT traffic.
        # In local environments with a SOCKS proxy configured, websockets 16
        # requires an extra dependency (`python-socks`) and fails before the
        # request reaches Volcano.
        volc_ws = await websockets.connect(
            ws_url,
            proxy=None,
            ping_interval=None,
            **get_ws_connect_config(),
        )

        # Send full client request with config
        init_frame = build_full_client_request(language=language, sequence=request_sequence)
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
                            transcript_event_count_local = 0
                            provider_final_seen = False
                            data = result.get("data", {})
                            direct_result = data.get("result", {})
                            direct_text = direct_result.get("text", "") if isinstance(direct_result, dict) else ""
                            audio_info = data.get("audio_info", {}) if isinstance(data, dict) else {}
                            for item in _iter_transcript_chunks(result):
                                text = item.get("text", "")
                                is_definite = item.get("definite", False)
                                provider_final_seen = provider_final_seen or is_definite
                                if text:
                                    transcript_event_count_local += 1
                                    await websocket.send_json({
                                        "type": "transcript",
                                        "text": text,
                                        "is_final": is_definite,
                                        "provider_final": is_definite,
                                    })
                                    logger.info(
                                        "stt_transcript_chunk text_chars=%d provider_final=%s",
                                        len(text),
                                        is_definite,
                                    )
                            nonlocal transcript_event_count, empty_result_count
                            transcript_event_count += transcript_event_count_local
                            if transcript_event_count_local == 0:
                                empty_result_count += 1

                            if transcript_event_count_local > 0 or empty_result_count <= 8 or empty_result_count % 20 == 0:
                                logger.info(
                                    "stt_upstream_result events=%d empty_results=%d direct_text_chars=%d provider_final=%s audio_duration=%s payload_keys=%s",
                                    transcript_event_count_local,
                                    empty_result_count,
                                    len(direct_text),
                                    provider_final_seen,
                                    audio_info.get("duration"),
                                    sorted(data.keys()) if isinstance(data, dict) else [],
                                )
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
        client_disconnected = False

        try:
            while True:
                message = await websocket.receive()

                if "bytes" in message and message["bytes"]:
                    audio_frame_count += 1
                    audio_stats = _describe_pcm16(message["bytes"])
                    if audio_frame_count <= 8 or audio_frame_count % 25 == 0:
                        logger.info(
                            "stt_audio_frame index=%d bytes=%d samples=%d peak=%d rms=%.2f nonzero_ratio=%.4f",
                            audio_frame_count,
                            len(message["bytes"]),
                            audio_stats["samples"],
                            audio_stats["peak"],
                            audio_stats["rms"],
                            audio_stats["nonzero_ratio"],
                        )
                    request_sequence += 1
                    audio_frame = build_audio_request(
                        message["bytes"],
                        sequence=request_sequence,
                        is_last=False,
                    )
                    await volc_ws.send(audio_frame)

                elif "text" in message and message["text"]:
                    data = json.loads(message["text"])
                    if data.get("type") == "stop":
                        request_sequence += 1
                        last_frame = build_audio_request(
                            b"",
                            sequence=request_sequence,
                            is_last=True,
                        )
                        await volc_ws.send(last_frame)
                        await asyncio.sleep(1.0)
                        break
        except WebSocketDisconnect:
            client_disconnected = True

        if client_disconnected:
            try:
                await asyncio.wait_for(asyncio.shield(relay_task), timeout=0.2)
            except (asyncio.TimeoutError, websockets.exceptions.ConnectionClosed):
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
        logger.info(
            "stt_session_closed audio_frames=%d transcript_events=%d empty_results=%d",
            audio_frame_count,
            transcript_event_count,
            empty_result_count,
        )
        if volc_ws:
            try:
                await volc_ws.close()
            except Exception:
                pass
