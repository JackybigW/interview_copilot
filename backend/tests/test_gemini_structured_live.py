import asyncio
import json
import os

import pytest
from langchain.chat_models import init_chat_model
from langchain_core.messages import HumanMessage, SystemMessage

from services.structured_schemas import JDProfile, ResumeProfile


MODEL_NAME = "gemini-3.1-pro-preview"

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
        messages = [
            SystemMessage(content=f"Extract {doc_type} information and return valid JSON only."),
            HumanMessage(content=sample_text),
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
