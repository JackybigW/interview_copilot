"""GLM-5 structured output service using LangChain for resume/JD extraction.

Uses DashScope's OpenAI-compatible API with langchain-openai ChatOpenAI
and .with_structured_output() for reliable structured extraction.
"""

import os
import logging
from typing import Union

from langchain_openai import ChatOpenAI
from langchain_core.messages import SystemMessage, HumanMessage

from services.structured_schemas import ResumeProfile, JDProfile

logger = logging.getLogger(__name__)


def _parse_env_value(raw: str, key_name: str) -> str:
    """Parse environment variable value, handling cases where the value
    contains the full KEY=VALUE format (e.g., 'DASHSCOPE_API_KEY=sk-xxx')."""
    if raw.startswith(f"{key_name}="):
        return raw[len(key_name) + 1:]
    return raw


def _get_llm() -> ChatOpenAI:
    """Initialize GLM-5 via DashScope's OpenAI-compatible endpoint."""
    raw_key = os.environ.get("DASHSCOPE_API_KEY", "")
    raw_url = os.environ.get("DASHSCOPE_BASE_URL", "https://dashscope.aliyuncs.com/compatible-mode/v1")

    api_key = _parse_env_value(raw_key, "DASHSCOPE_API_KEY")
    base_url = _parse_env_value(raw_url, "DASHSCOPE_BASE_URL")

    logger.info(f"GLM-5 init: key starts with {api_key[:8]}..., base_url={base_url}")

    return ChatOpenAI(
        model="glm-5",
        api_key=api_key,
        base_url=base_url,
        temperature=0,  # Zero temperature for deterministic extraction
        max_tokens=4096,
    )


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


async def extract_resume_profile(resume_text: str, language: str = "en") -> ResumeProfile:
    """Extract structured profile from resume text using GLM-5 with structured output."""
    llm = _get_llm()
    resume_extractor = llm.with_structured_output(ResumeProfile)

    lang_hint = ""
    if language == "zh":
        lang_hint = "\n\nPlease extract and output all fields in Chinese (中文)."
    elif language == "mixed":
        lang_hint = "\n\nExtract in the original language of the resume. Use Chinese for Chinese content and English for English content."

    messages = [
        SystemMessage(content=RESUME_SYSTEM_PROMPT + lang_hint),
        HumanMessage(content=f"Please extract structured information from this resume and return it as a JSON object:\n\n{resume_text}"),
    ]

    try:
        result = await resume_extractor.ainvoke(messages)
        return result
    except Exception as e:
        logger.error(f"Resume extraction error: {e}")
        raise


async def extract_jd_profile(jd_text: str, language: str = "en") -> JDProfile:
    """Extract structured profile from JD text using GLM-5 with structured output."""
    llm = _get_llm()
    jd_extractor = llm.with_structured_output(JDProfile)

    lang_hint = ""
    if language == "zh":
        lang_hint = "\n\nPlease extract and output all fields in Chinese (中文)."
    elif language == "mixed":
        lang_hint = "\n\nExtract in the original language of the JD. Use Chinese for Chinese content and English for English content."

    messages = [
        SystemMessage(content=JD_SYSTEM_PROMPT + lang_hint),
        HumanMessage(content=f"Please extract structured information from this job description and return it as a JSON object:\n\n{jd_text}"),
    ]

    try:
        result = await jd_extractor.ainvoke(messages)
        return result
    except Exception as e:
        logger.error(f"JD extraction error: {e}")
        raise


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