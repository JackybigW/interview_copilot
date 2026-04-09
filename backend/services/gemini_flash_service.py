"""Gemini Flash native streaming service for real-time interview answer generation.

Uses google-genai library directly for low-latency streaming responses.
Model: gemini-3-flash-preview
"""

import os
import logging
from typing import AsyncGenerator

from google import genai

logger = logging.getLogger(__name__)


def _get_client() -> genai.Client:
    """Get a Google GenAI client."""
    api_key = os.environ.get("GEMINI_API_KEY", "")
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
        "Based on the candidate's background and the job requirements, provide a concise, professional answer.\n\n"
        "Rules:\n"
        "- Be concise but thorough (3-6 sentences)\n"
        "- Use the STAR method for behavioral questions\n"
        "- Reference specific experiences from the resume when relevant\n"
        "- Align answers with the job requirements\n"
        "- Sound natural, not robotic\n"
        "- Focus on key points the candidate should mention\n"
        f"{lang_instruction}"
    )

    user_content = f"The interviewer asked: {question}\n\nProvide a suggested answer:"
    if transcript_context:
        user_content = f"Recent conversation:\n{transcript_context}\n\n{user_content}"

    try:
        client = _get_client()

        response = client.models.generate_content_stream(
            model="gemini-3-flash-preview",
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
        "   [QUESTION]: <the detected question>\n"
        "   [ANSWER]: <a concise, professional answer>\n\n"
        "3. If no clear question is detected, respond with:\n"
        "   [NO_QUESTION]\n\n"
        "Rules for answers:\n"
        "- Be concise but thorough (3-6 sentences max)\n"
        "- Use the STAR method for behavioral questions\n"
        "- Reference specific experiences from the resume when relevant\n"
        "- Sound natural, not robotic\n"
        "- Focus on key points the candidate should mention"
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
            model="gemini-3-flash-preview",
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