"""Gemini Flash structured extraction service using LangChain Google GenAI."""

import json
import logging
import os
import time
from functools import lru_cache
from typing import Any

from langchain.chat_models import init_chat_model
from langchain_core.messages import HumanMessage, SystemMessage

from services.structured_schemas import JDProfile, ResumeProfile

logger = logging.getLogger(__name__)

DEFAULT_GEMINI_STRUCTURED_MODEL = "gemini-3-flash-preview"


def _get_structured_model() -> str:
    return os.getenv("GEMINI_STRUCTURED_MODEL", DEFAULT_GEMINI_STRUCTURED_MODEL)

RESUME_SYSTEM_PROMPT = """You are an expert resume analyst. Your task is to extract structured information from a candidate's resume and return the result as a JSON object.

Focus on:
1. **Technical/Hard Skills**: Extract ALL programming languages, frameworks, tools, databases, cloud platforms, etc.
2. **Projects**: Extract the top 3-5 most impressive projects with their tech stack and quantified achievements.
3. **Work Experience**: Extract company, title, duration, responsibilities, and achievements.
4. **Strongest Points**: Identify the top 3-5 selling points for interviews.

Be thorough and precise. Extract actual data from the resume, do not fabricate information.
If a field is not mentioned in the resume, leave it empty or as an empty list.
You MUST respond with a valid JSON object matching the required schema."""

JD_SYSTEM_PROMPT = """You are an expert job description analyst. Your task is to extract structured information from a job description and return the result as a JSON object.

Focus on:
1. **Required vs Preferred Skills**: Clearly distinguish between MUST-HAVE requirements and NICE-TO-HAVE/preferred qualifications.
2. **Technical Stack**: Extract all technologies, tools, and platforms mentioned.
3. **Interview Focus Areas**: Based on the emphasis in the JD, predict what the interviewer will likely ask about.
4. **Keywords**: Identify domain-specific terms the candidate should use in their answers.

Be thorough and precise. Extract actual data from the JD, do not fabricate information.
Mark each requirement as required (is_required=true) or preferred (is_required=false) based on the JD language.
You MUST respond with a valid JSON object matching the required schema."""


def _parse_env_value(raw: str, key_name: str) -> str:
    """Handle env values accidentally pasted as KEY=VALUE."""
    if raw.startswith(f"{key_name}="):
        return raw[len(key_name) + 1:]
    return raw


def _get_google_api_key() -> str:
    raw_key = os.environ.get("GOOGLE_API_KEY") or os.environ.get("GEMINI_API_KEY", "")
    api_key = _parse_env_value(raw_key, "GOOGLE_API_KEY")
    api_key = _parse_env_value(api_key, "GEMINI_API_KEY")
    if not api_key:
        raise RuntimeError("Missing GOOGLE_API_KEY for Gemini structured extraction.")
    return api_key


@lru_cache(maxsize=8)
def _get_llm_cached(model_name: str, api_key: str):
    logger.info("Gemini structured init: model=%s key_prefix=%s", model_name, api_key[:8])
    return init_chat_model(
        model=model_name,
        model_provider="google_genai",
        api_key=api_key,
        temperature=0,
    )


def _get_llm():
    api_key = _get_google_api_key()
    return _get_llm_cached(_get_structured_model(), api_key)


def _language_hint(language: str, source_kind: str) -> str:
    if language == "zh":
        return "\n\nPlease extract and output all fields in Chinese (中文)."
    if language == "mixed":
        return (
            f"\n\nExtract in the original language of the {source_kind}. "
            "Use Chinese for Chinese content and English for English content."
        )
    return ""


def _refinement_language_hint(language: str) -> str:
    if language == "zh":
        return "\nPlease output all fields in Chinese (中文)."
    if language == "mixed":
        return "\nUse the original language of the content."
    return ""


async def _invoke_structured_output(
    *,
    schema_cls: type[ResumeProfile] | type[JDProfile],
    system_prompt: str,
    user_prompt: str,
    request_type: str,
    input_chars: int,
):
    model_name = _get_structured_model()
    start = time.perf_counter()
    llm = _get_llm()
    structured_llm = llm.with_structured_output(schema_cls)
    messages = [
        SystemMessage(content=system_prompt),
        HumanMessage(content=user_prompt),
    ]
    try:
        result = await structured_llm.ainvoke(messages)
        logger.info(
            "structured_analysis request_type=%s model=%s input_chars=%d latency_ms=%.1f status=ok",
            request_type,
            model_name,
            input_chars,
            (time.perf_counter() - start) * 1000,
        )
        return result
    except Exception as exc:
        logger.error(
            "structured_analysis request_type=%s model=%s input_chars=%d latency_ms=%.1f status=error error=%s",
            request_type,
            model_name,
            input_chars,
            (time.perf_counter() - start) * 1000,
            exc,
        )
        raise


async def extract_resume_profile(resume_text: str, language: str = "en") -> ResumeProfile:
    """Extract a structured resume profile with Gemini Flash."""
    return await _invoke_structured_output(
        schema_cls=ResumeProfile,
        system_prompt=RESUME_SYSTEM_PROMPT + _language_hint(language, "resume"),
        user_prompt=(
            "Please extract structured information from this resume and return it as a JSON object:\n\n"
            f"{resume_text}"
        ),
        request_type="resume",
        input_chars=len(resume_text),
    )


async def extract_jd_profile(jd_text: str, language: str = "en") -> JDProfile:
    """Extract a structured JD profile with Gemini Flash."""
    return await _invoke_structured_output(
        schema_cls=JDProfile,
        system_prompt=JD_SYSTEM_PROMPT + _language_hint(language, "JD"),
        user_prompt=(
            "Please extract structured information from this job description and return it as a JSON object:\n\n"
            f"{jd_text}"
        ),
        request_type="jd",
        input_chars=len(jd_text),
    )


async def refine_structured_profile(
    *,
    current_structured: dict[str, Any],
    feedback: str,
    doc_type: str = "resume",
    language: str = "en",
) -> ResumeProfile | JDProfile:
    """Refine an existing structured resume or JD profile using Gemini Flash."""
    if doc_type == "resume":
        schema_cls = ResumeProfile
        role_desc = "resume analyst"
    else:
        schema_cls = JDProfile
        role_desc = "job description analyst"

    system_prompt = (
        f"You are an expert {role_desc}. The user has already analyzed a document "
        "and received a structured JSON result. Now the user wants to modify it. "
        "Apply the user's feedback to the current result and return an updated JSON object. "
        f"Only change what the user asks for; keep everything else the same.{_refinement_language_hint(language)}"
    )
    user_prompt = (
        "Current structured analysis result:\n"
        f"```json\n{json.dumps(current_structured, ensure_ascii=False, indent=2)}\n```\n\n"
        "User's modification request:\n"
        f"{feedback}\n\n"
        "Please apply the modifications and return the updated JSON object."
    )

    return await _invoke_structured_output(
        schema_cls=schema_cls,
        system_prompt=system_prompt,
        user_prompt=user_prompt,
        request_type=f"refine_{doc_type}",
        input_chars=len(json.dumps(current_structured, ensure_ascii=False)) + len(feedback),
    )


def build_concise_context(
    resume: ResumeProfile | None = None,
    jd: JDProfile | None = None,
) -> str:
    """Build a concise context string from structured profiles for Gemini's context window.

    This produces a compact, information-dense context that helps Gemini Flash
    generate relevant, personalized interview answers quickly.
    """
    parts = []

    if resume:
        lines = ["=== CANDIDATE PROFILE ==="]
        if resume.candidate_name:
            lines.append(f"Name: {resume.candidate_name}")
        if resume.years_of_experience:
            lines.append(f"Experience: {resume.years_of_experience}")
        if resume.technical_skills:
            lines.append(f"Tech Skills: {', '.join(resume.technical_skills)}")
        if resume.soft_skills:
            lines.append(f"Soft Skills: {', '.join(resume.soft_skills)}")
        if resume.education:
            lines.append(f"Education: {'; '.join(resume.education)}")
        if resume.certifications:
            lines.append(f"Certifications: {', '.join(resume.certifications)}")

        if resume.projects:
            lines.append("\nKey Projects:")
            for p in resume.projects[:5]:
                tech = f" [{', '.join(p.tech_stack)}]" if p.tech_stack else ""
                lines.append(f"  • {p.name}{tech}")
                for h in p.highlights[:2]:
                    lines.append(f"    - {h}")

        if resume.work_experiences:
            lines.append("\nWork Experience:")
            for w in resume.work_experiences[:3]:
                lines.append(f"  • {w.title} @ {w.company} ({w.duration})")
                for a in w.achievements[:2]:
                    lines.append(f"    - {a}")

        if resume.strongest_points:
            lines.append(f"\nStrongest Points: {'; '.join(resume.strongest_points)}")

        parts.append("\n".join(lines))

    if jd:
        lines = ["=== TARGET POSITION ==="]
        if jd.job_title:
            lines.append(f"Role: {jd.job_title}")
        if jd.company:
            lines.append(f"Company: {jd.company}")
        if jd.level:
            lines.append(f"Level: {jd.level}")
        if jd.required_skills:
            lines.append(f"Required Skills: {', '.join(jd.required_skills)}")
        if jd.preferred_skills:
            lines.append(f"Preferred Skills: {', '.join(jd.preferred_skills)}")
        if jd.tech_stack:
            lines.append(f"Tech Stack: {', '.join(jd.tech_stack)}")
        if jd.interview_focus_areas:
            lines.append(f"Interview Focus: {'; '.join(jd.interview_focus_areas)}")
        if jd.keywords:
            lines.append(f"Keywords to use: {', '.join(jd.keywords)}")
        if jd.responsibilities:
            lines.append("\nKey Responsibilities:")
            for r in jd.responsibilities[:5]:
                lines.append(f"  • {r}")

        parts.append("\n".join(lines))

    return "\n\n".join(parts)
