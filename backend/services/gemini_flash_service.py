"""Gemini Flash native streaming service for real-time interview answer generation.

Uses google-genai library directly for low-latency streaming responses.
Model: gemini-3-flash-preview
"""

import os
import logging
from functools import lru_cache
from typing import AsyncGenerator

from google import genai

logger = logging.getLogger(__name__)

GEMINI_FLASH_MODEL = os.getenv("GEMINI_FLASH_MODEL", "gemini-3-flash-preview")


def extract_question_from_detected_content(content: str) -> str:
    """Extract just the detected question text from a tagged Gemini response."""
    trimmed = content.strip()
    if not trimmed or "[NO_QUESTION]" in trimmed:
        return ""

    question_start = trimmed.find("[QUESTION]:")
    if question_start == -1:
        return ""

    answer_start = trimmed.find("[ANSWER]:", question_start)
    if answer_start == -1:
        return trimmed[question_start + len("[QUESTION]:") :].strip()

    return trimmed[question_start + len("[QUESTION]:") : answer_start].strip()


@lru_cache(maxsize=1)
def _get_client() -> genai.Client:
    """Get a Google GenAI client."""
    api_key = os.environ.get("GEMINI_API_KEY", "")
    logger.info("Gemini Flash client init: key_prefix=%s", api_key[:8])
    return genai.Client(api_key=api_key)


async def generate_answer_stream(
    question: str,
    context: str = "",
    transcript_context: str = "",
    language: str = "en",
) -> AsyncGenerator[str, None]:
    """Generate a streaming interview answer using Gemini Flash.
    
    Args:
        question: The interviewer's question
        context: Structured resume/JD context (from build_concise_context)
        transcript_context: Recent conversation transcript
        language: Response language preference
    
    Yields:
        Text chunks as they are generated
    """
    lang_instruction = ""
    if language == "zh":
        lang_instruction = "Please respond in Chinese (中文)."
    elif language == "mixed":
        lang_instruction = "Respond in the same language as the question. If Chinese, respond in Chinese. If English, respond in English."

    system_instruction = (
        "You are an expert AI interview copilot helping a candidate in a live interview.\n\n"
        f"{context}\n\n"
        "Based on the candidate's background and the job requirements, provide a concise, directly usable interview answer.\n\n"
        "Rules:\n"
        "- The candidate must be able to read this during the interview immediately\n"
        "- Keep the answer concise and directly usable in a real interview\n"
        "- Answer in 3-4 short spoken sentences max\n"
        "- Each sentence should be concrete, defensible, and relevant to the question\n"
        "- Use the STAR method for behavioral questions when helpful\n"
        "- Reference specific experiences from the resume when relevant\n"
        "- Align answers with the job requirements\n"
        "- Write in first person, as if you are the candidate speaking directly\n"
        "- Sound like a strong big-tech interview candidate: clear, structured, calm, and credible\n"
        "- Do not explain strategy, do not say 'you can say', and do not give meta commentary\n"
        "- Do not output markdown bullets, numbered lists, titles, or section headers\n"
        "- Output only the final answer the candidate should read"
        f"{lang_instruction}"
    )

    user_content = f"The interviewer asked: {question}\n\nProvide a suggested answer:"
    if transcript_context:
        user_content = f"Recent conversation:\n{transcript_context}\n\n{user_content}"

    try:
        client = _get_client()

        response = client.models.generate_content_stream(
            model=GEMINI_FLASH_MODEL,
            contents=user_content,
            config=genai.types.GenerateContentConfig(
                system_instruction=system_instruction,
                temperature=0.7,
                max_output_tokens=1024,
            ),
        )

        for chunk in response:
            if chunk.text:
                yield chunk.text

    except Exception as e:
        logger.error(f"Gemini Flash streaming error: {e}")
        yield f"[Error generating answer: {str(e)}]"


async def detect_question_and_answer_stream(
    transcript: str,
    context: str = "",
    language: str = "en",
) -> AsyncGenerator[str, None]:
    """Detect questions from transcript and generate answers using Gemini Flash streaming.
    
    Args:
        transcript: Recent interview transcript
        context: Structured resume/JD context
        language: Response language preference
    
    Yields:
        Text chunks. The full response will contain [QUESTION] and [ANSWER] tags if a question is detected,
        or [NO_QUESTION] if no question is found.
    """
    lang_instruction = ""
    if language == "zh":
        lang_instruction = "\nPlease respond in Chinese (中文)."
    elif language == "mixed":
        lang_instruction = "\nRespond in the same language as the question."

    system_instruction = (
        "You are an expert AI interview copilot.\n\n"
        f"{context}\n\n"
        "The transcript is labeled with [interviewer] and [user] tags.\n\n"
        "When given a transcript, you must:\n"
        "1. Focus on what the INTERVIEWER said. Determine if the interviewer has asked a new question.\n"
        "2. If a question is detected, respond in this exact format:\n"
        "   [QUESTION]: <the detected question only>\n"
        "   [ANSWER]: <the full candidate answer>\n\n"
        "3. If no clear question is detected, respond with:\n"
        "   [NO_QUESTION]\n\n"
        "Rules for question detection:\n"
        "- The detected question must contain only the interviewer's actual question text\n"
        "- Do not include any answer content in [QUESTION]\n"
        "- Ignore warm-up chatter, fillers, and incomplete lead-ins\n"
        "- Return [NO_QUESTION] until the interviewer has asked a valid, complete question\n\n"
        "Rules for the answer:\n"
        "- The candidate must be able to read this during the interview immediately\n"
        "- Start with exactly 3 bullet points of the key ideas only\n"
        "- Then write a full spoken transcript the candidate can say out loud naturally\n"
        "- Keep the spoken transcript to 3-5 spoken sentences\n"
        "- Use the STAR method for behavioral questions when helpful\n"
        "- Reference specific experiences from the resume when relevant\n"
        "- Align answers with the job requirements\n"
        "- Write in first person, as if you are the candidate speaking directly\n"
        "- Sound natural, confident, and conversational, not like advice to the candidate\n"
        "- Do not explain strategy, do not say 'you can say', and do not give meta commentary\n"
        "- In [ANSWER], use this exact structure:\n"
        "  Key points:\n"
        "  - ...\n"
        "  - ...\n"
        "  - ...\n"
        "  Script:\n"
        "  ..."
        f"{lang_instruction}"
    )

    user_content = (
        f"Here is the recent interview transcript:\n\n\"{transcript}\"\n\n"
        "Analyze the latest part. Has the interviewer asked a new question? "
        "If yes, identify it and provide a helpful answer."
    )

    try:
        client = _get_client()

        response = client.models.generate_content_stream(
            model=GEMINI_FLASH_MODEL,
            contents=user_content,
            config=genai.types.GenerateContentConfig(
                system_instruction=system_instruction,
                temperature=0.7,
                max_output_tokens=1024,
            ),
        )

        for chunk in response:
            if chunk.text:
                yield chunk.text

    except Exception as e:
        logger.error(f"Gemini Flash question detection error: {e}")
        yield "[NO_QUESTION]"
