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
