import pytest

from services.structured_schemas import ResumeProfile


def test_build_concise_context_keeps_existing_contract():
    from services.gemini_structured_service import build_concise_context

    resume = ResumeProfile(
        candidate_name="Jacky",
        years_of_experience="3 years",
        technical_skills=["Python", "LangGraph"],
        soft_skills=["Communication"],
        education=["Edinburgh"],
        strongest_points=["Eval pipeline"],
    )

    context = build_concise_context(resume=resume, jd=None)

    assert "=== CANDIDATE PROFILE ===" in context
    assert "Name: Jacky" in context
    assert "Experience: 3 years" in context
    assert "Tech Skills: Python, LangGraph" in context
    assert "Soft Skills: Communication" in context
    assert "Education: Edinburgh" in context
    assert "Strongest Points: Eval pipeline" in context


@pytest.mark.asyncio
async def test_refine_resume_profile_uses_structured_output_without_live_api(monkeypatch):
    from services.gemini_structured_service import refine_structured_profile

    captured = {}

    class FakeStructuredLLM:
        async def ainvoke(self, messages):
            captured["messages"] = messages
            return ResumeProfile(
                candidate_name="Jacky Wang",
                technical_skills=["Python", "FastAPI"],
                strongest_points=["Structured extraction"],
            )

    class FakeLLM:
        def with_structured_output(self, schema_cls):
            captured["schema_cls"] = schema_cls
            return FakeStructuredLLM()

    monkeypatch.setattr(
        "services.gemini_structured_service._get_llm",
        lambda: FakeLLM(),
    )

    result = await refine_structured_profile(
        current_structured={
            "candidate_name": "Jacky",
            "technical_skills": ["Python"],
        },
        feedback="Update the candidate name to Jacky Wang and add FastAPI.",
        doc_type="resume",
        language="en",
    )

    assert isinstance(result, ResumeProfile)
    assert result.candidate_name == "Jacky Wang"
    assert result.technical_skills == ["Python", "FastAPI"]
    assert captured["schema_cls"] is ResumeProfile
    assert "Current structured analysis result" in captured["messages"][1].content
    assert "Jacky Wang" in captured["messages"][1].content
    assert "Only change what the user asks for" in captured["messages"][0].content
