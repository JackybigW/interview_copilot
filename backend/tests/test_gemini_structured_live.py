import asyncio
import json
import os

import pytest
from langchain.chat_models import init_chat_model
from langchain_core.messages import HumanMessage, SystemMessage

from services.structured_schemas import JDProfile, ResumeProfile


MODEL_NAME = "gemini-3-pro-preview"

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

RESUME_SAMPLE = """王子飏
(Jacky)
jackyw1205@gmail.com | +86 13776699305
意向岗位：AI 数据运营 / 大模型评测与交付
教育经历
爱丁堡大学 2018–2022
Master of Science with Honours in Mathematics
专业技能
LangChain、LangGraph、FastAPI、Python、Pydantic、Redis、PostgreSQL、Prompt Engineering、LLM-as-a-Judge、SQL
工作经历
暴叔讲留学 2023.12–至今
智能体项目开发与数据评测治理
独立完成 AI workflow 搭建、评测体系建设、坏例回流与回归测试门禁。
项目经历
大模型评测体系搭建与黄金数据集治理
构建 2000+ 黄金数据集，建立自动化评测与 Failure Analysis 闭环。
"""

JD_SAMPLE = """大模型数据项目运营/经理
岗位职责：
1. 负责大模型数据项目的交付、质量控制和跨团队协作。
2. 制定标注规范、验收标准和项目流程。
3. 推动 Prompt Engineering、Agent 和评测体系在业务中的落地。
任职要求：
1. 本科及以上学历。
2. 熟悉 Python、SQL 等编程语言。
3. 具备 1 年以上大模型相关经验。
4. 英文可作为工作语言。
加分项：
1. 有数据项目管理经验。
2. 对大模型训练、评测及应用有浓厚兴趣。
"""


def _is_empty_resume(profile: ResumeProfile) -> bool:
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


def _is_empty_jd(profile: JDProfile) -> bool:
    return not any(
        [
            profile.job_title,
            profile.company,
            profile.required_skills,
            profile.preferred_skills,
            profile.requirements,
            profile.responsibilities,
            profile.interview_focus_areas,
            profile.keywords,
            profile.tech_stack,
            profile.years_experience_required,
        ]
    )


def _render_raw_output(raw: object) -> str:
    if hasattr(raw, "model_dump_json"):
        return raw.model_dump_json(indent=2, ensure_ascii=False)
    if hasattr(raw, "content"):
        content = raw.content
        if isinstance(content, str):
            return content
        return json.dumps(content, ensure_ascii=False, indent=2, default=str)
    return json.dumps(raw, ensure_ascii=False, indent=2, default=str)


def _assert_resume_facts(profile: ResumeProfile) -> None:
    assert profile.candidate_name and "王子飏" in profile.candidate_name
    assert any(skill == "Python" for skill in profile.technical_skills)
    assert any(skill == "LangChain" for skill in profile.technical_skills)
    assert any("黄金数据集" in project.name for project in profile.projects)
    assert any("暴叔讲留学" in work.company for work in profile.work_experiences)
    assert any("智能体项目开发与数据评测治理" in work.title for work in profile.work_experiences)


def _assert_jd_facts(profile: JDProfile) -> None:
    assert profile.job_title and "大模型数据项目运营" in profile.job_title
    assert any(skill == "Python" for skill in profile.required_skills)
    assert any(skill == "SQL" for skill in profile.required_skills)
    assert any(
        "Prompt Engineering" in focus or "评测" in focus
        for focus in profile.interview_focus_areas
    )
    assert any("本科" in req.description for req in profile.requirements)
    assert any("1 年以上" in req.description or "1年以上" in req.description for req in profile.requirements)


@pytest.mark.parametrize(
    ("schema_cls", "doc_type", "sample_text", "is_empty"),
    [
        (ResumeProfile, "resume", RESUME_SAMPLE, _is_empty_resume),
        (JDProfile, "jd", JD_SAMPLE, _is_empty_jd),
    ],
)
def test_gemini_pro_structured_output_live(schema_cls, doc_type, sample_text, is_empty):
    if os.getenv("RUN_GEMINI_LIVE") != "1":
        pytest.skip("Set RUN_GEMINI_LIVE=1 to run the live Gemini structured output repro test.")

    api_key = os.getenv("GOOGLE_API_KEY")
    if not api_key:
        pytest.fail("GOOGLE_API_KEY is required when RUN_GEMINI_LIVE=1.")

    async def _run() -> tuple[object, object]:
        llm = init_chat_model(
            model=MODEL_NAME,
            model_provider="google_genai",
            api_key=api_key,
            temperature=0,
        )
        lang_hint = "\n\nPlease extract and output all fields in Chinese (中文)."
        if doc_type == "resume":
            system_content = RESUME_SYSTEM_PROMPT + lang_hint
            human_content = (
                "Please extract structured information from this resume and return it as a JSON object:\n\n"
                f"{sample_text}"
            )
        else:
            system_content = JD_SYSTEM_PROMPT + lang_hint
            human_content = (
                "Please extract structured information from this job description and return it as a JSON object:\n\n"
                f"{sample_text}"
            )

        messages = [
            SystemMessage(content=system_content),
            HumanMessage(content=human_content),
        ]

        parsed = await llm.with_structured_output(schema_cls).ainvoke(messages)
        raw = await llm.ainvoke(messages)
        return parsed, raw

    parsed, raw = asyncio.run(_run())

    print(f"\n=== Parsed {schema_cls.__name__} ===")
    print(parsed.model_dump_json(indent=2, ensure_ascii=False))
    print(f"\n=== Raw {schema_cls.__name__} ===")
    print(_render_raw_output(raw))

    assert not is_empty(parsed), f"Gemini returned an effectively empty {schema_cls.__name__}."
    if schema_cls is ResumeProfile:
        _assert_resume_facts(parsed)
    else:
        _assert_jd_facts(parsed)
