"""GLM-5 structured output service using LangChain for resume/JD extraction.

Uses DashScope's OpenAI-compatible API with langchain-openai ChatOpenAI
and .with_structured_output() for reliable structured extraction.
"""

import json
import os
import logging
import re
from typing import Any, Union

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


def _dedupe_keep_order(items: list[str]) -> list[str]:
    seen: set[str] = set()
    result: list[str] = []
    for item in items:
        normalized = item.strip()
        if not normalized or normalized in seen:
            continue
        seen.add(normalized)
        result.append(normalized)
    return result


def _to_string_list(value: Any) -> list[str]:
    if value is None:
        return []
    if isinstance(value, str):
        return [value]
    if isinstance(value, dict):
        values: list[str] = []
        for item in value.values():
            values.extend(_to_string_list(item))
        return values
    if isinstance(value, list):
        values: list[str] = []
        for item in value:
            values.extend(_to_string_list(item))
        return values
    return [str(value)]


def _extract_json_block(text: str) -> dict[str, Any]:
    """Extract the first JSON object from a raw LLM response."""
    fenced_match = re.search(r"```json\s*(\{.*\})\s*```", text, flags=re.DOTALL)
    candidate = fenced_match.group(1) if fenced_match else text.strip()
    start = candidate.find("{")
    end = candidate.rfind("}")
    if start == -1 or end == -1 or end <= start:
        raise ValueError("No JSON object found in LLM response")
    return json.loads(candidate[start : end + 1])


def _is_resume_profile_empty(profile: ResumeProfile) -> bool:
    return not any(
        [
            profile.candidate_name,
            profile.years_of_experience,
            profile.technical_skills,
            profile.soft_skills,
            profile.projects,
            profile.work_experiences,
            profile.education,
            profile.strongest_points,
            profile.certifications,
        ]
    )


def normalize_loose_resume_payload(payload: dict[str, Any]) -> ResumeProfile:
    """Map loose Chinese-keyed resume JSON into the strict ResumeProfile schema."""
    basic_info = payload.get("基本信息") or {}
    skill_sections = payload.get("专业技能") or {}
    work_entries = payload.get("工作经历") or []
    project_entries = payload.get("项目经历") or []
    education_entries = payload.get("教育经历") or []
    tool_sections = payload.get("技术与工具") or {}

    technical_skills: list[str] = []
    soft_skills: list[str] = []

    if isinstance(skill_sections, dict):
        for key, value in skill_sections.items():
            extracted_values = _to_string_list(value)
            technical_skills.extend(extracted_values)
            technical_skills.append(str(key))
    else:
        technical_skills.extend(_to_string_list(skill_sections))

    if isinstance(tool_sections, dict):
        for key, values in tool_sections.items():
            technical_skills.append(str(key))
            technical_skills.extend(_to_string_list(values))
    else:
        technical_skills.extend(_to_string_list(tool_sections))

    for item in _to_string_list(skill_sections):
        if any(token in item.lower() for token in ["雅思", "英语", "英文", "沟通", "communication"]):
            soft_skills.append(item)

    projects = []
    for entry in project_entries:
        if not isinstance(entry, dict):
            continue
        highlights = entry.get("项目内容") or entry.get("成果") or entry.get("亮点") or []
        highlights = _to_string_list(highlights)
        tech_stack = entry.get("技术栈") or entry.get("技术与工具") or []
        tech_stack = _to_string_list(tech_stack)
        projects.append(
            {
                "name": entry.get("项目名称") or entry.get("name") or "",
                "role": entry.get("角色") or entry.get("role") or "",
                "tech_stack": tech_stack,
                "highlights": highlights,
            }
        )

    work_experiences = []
    for entry in work_entries:
        if not isinstance(entry, dict):
            continue
        responsibilities = []
        achievements = []
        for item in entry.get("工作内容") or entry.get("职责与成果") or []:
            if isinstance(item, dict):
                role = str(item.get("职责") or "").strip()
                detail = str(item.get("详情") or item.get("成果") or "").strip()
                combined = "：".join(part for part in [role, detail] if part)
                if combined:
                    responsibilities.append(combined)
                if any(token in combined for token in ["增长", "%", "提升", "降低", "控制", "GMV", "0-1", "落地"]):
                    achievements.append(combined)
            elif isinstance(item, str):
                responsibilities.append(item)
        work_experiences.append(
            {
                "company": entry.get("公司") or entry.get("company") or "",
                "title": entry.get("职位") or entry.get("岗位") or "",
                "duration": entry.get("时间") or entry.get("duration") or "",
                "key_responsibilities": responsibilities,
                "achievements": achievements or responsibilities[:2],
            }
        )

    education = []
    for entry in education_entries:
        if isinstance(entry, dict):
            parts = [entry.get("学校"), entry.get("专业") or entry.get("学位"), entry.get("时间"), entry.get("成就")]
            education.append(" | ".join(str(part).strip() for part in parts if part))
        elif isinstance(entry, str):
            education.append(entry)

    strongest_points = payload.get("个人优势") or payload.get("highlights") or []
    if isinstance(strongest_points, str):
        strongest_points = [strongest_points]

    if isinstance(skill_sections, dict):
        language_skill = skill_sections.get("语言能力")
        soft_skills.extend(_to_string_list(language_skill))

    return ResumeProfile(
        candidate_name=basic_info.get("姓名") or basic_info.get("name") or "",
        years_of_experience=basic_info.get("工作年限") or basic_info.get("年限") or "",
        technical_skills=_dedupe_keep_order(technical_skills),
        soft_skills=_dedupe_keep_order(soft_skills),
        projects=projects,
        work_experiences=work_experiences,
        education=_dedupe_keep_order(education),
        strongest_points=_dedupe_keep_order([str(item) for item in strongest_points]),
        certifications=[],
    )


async def _fallback_extract_resume_profile(resume_text: str, language: str) -> ResumeProfile:
    """Use a looser JSON prompt and normalize the result when schema parsing collapses."""
    llm = _get_llm()
    lang_hint = "请使用中文字段名输出 JSON。" if language == "zh" else "Return JSON only."
    messages = [
        SystemMessage(
            content=(
                "你是资深中文简历分析师。请从简历中提取真实信息，直接输出 JSON。"
                "至少包含：基本信息、教育经历、专业技能、工作经历、项目经历、个人优势。"
                "不要解释，不要输出除 JSON 外的内容。"
                f"{lang_hint}"
            )
        ),
        HumanMessage(content=f"请解析这份简历，输出结构化 JSON：\n\n{resume_text}"),
    ]

    raw_response = await llm.ainvoke(messages)
    payload = _extract_json_block(raw_response.content if isinstance(raw_response.content, str) else str(raw_response.content))
    return normalize_loose_resume_payload(payload)


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
        if _is_resume_profile_empty(result):
            logger.warning("Resume structured output came back empty, switching to loose JSON fallback")
            return await _fallback_extract_resume_profile(resume_text, language)
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
