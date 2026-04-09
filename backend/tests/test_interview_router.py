import logging

import pytest


@pytest.mark.asyncio
async def test_generate_answer_logs_stream_timing(monkeypatch, caplog):
    import routers.interview as interview

    caplog.set_level(logging.INFO)

    async def fake_stream(*, question, context, transcript_context, language):
        assert question == "What are your strengths?"
        assert context == "resume\n\njd"
        assert transcript_context == "recent transcript"
        assert language == "en"
        yield "first chunk"
        yield "second chunk"

    monkeypatch.setattr(interview, "generate_answer_stream", fake_stream)

    response = await interview.generate_answer(
        interview.GenerateAnswerRequest(
            question="What are your strengths?",
            resume_context="resume",
            jd_context="jd",
            transcript_context="recent transcript",
            language="en",
        )
    )

    chunks = []
    async for chunk in response.body_iterator:
        if isinstance(chunk, bytes):
            chunks.append(chunk.decode())
        else:
            chunks.append(chunk)

    assert chunks == [
        "data: first chunk\n\n",
        "data: second chunk\n\n",
        "data: [DONE]\n\n",
    ]
    assert "copilot_answer request_type=generate_answer model=gemini-3-flash-preview" in caplog.text
    assert "copilot_answer first_chunk model=gemini-3-flash-preview" in caplog.text
    assert "copilot_answer complete model=gemini-3-flash-preview" in caplog.text


@pytest.mark.asyncio
async def test_update_session_only_updates_title(monkeypatch):
    import routers.interview as interview

    captured = {}

    class FakeService:
        def __init__(self, db):
            self.db = db

        async def update(self, obj_id, update_data, user_id=None):
            captured["obj_id"] = obj_id
            captured["update_data"] = update_data
            captured["user_id"] = user_id
            return object()

    monkeypatch.setattr(interview, "Interview_sessionsService", FakeService)

    response = await interview.update_session(
        42,
        interview.UpdateSessionRequest(title="New title"),
        db=object(),
    )

    assert response == {"status": "updated"}
    assert captured == {
        "obj_id": 42,
        "update_data": {"title": "New title"},
        "user_id": "anonymous",
    }
