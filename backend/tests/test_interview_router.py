import logging

import pytest


@pytest.mark.asyncio
async def test_websocket_relay_forwards_direct_result_text(monkeypatch):
    import routers.interview as interview

    sent = []

    class FakeClientWebSocket:
        async def accept(self):
            return None

        async def receive_text(self):
            return '{"type":"config","language":"zh"}'

        async def receive(self):
            raise interview.WebSocketDisconnect()

        async def send_json(self, payload):
            sent.append(payload)

    class FakeVolcanoWebSocket:
        def __init__(self):
            self._messages = [b"ack", b"result"]

        async def send(self, payload):
            return None

        async def recv(self):
            return self._messages.pop(0)

        async def close(self):
            return None

        def __aiter__(self):
            return self

        async def __anext__(self):
            if not self._messages:
                raise StopAsyncIteration
            return self._messages.pop(0)

    async def fake_connect(*args, **kwargs):
        return FakeVolcanoWebSocket()

    def fake_parse(data):
        if data == b"ack":
            return {"type": "ack"}
        return {
            "type": "result",
            "data": {
                "result": {
                    "text": "你好世界",
                    "definite": True,
                }
            },
        }

    monkeypatch.setattr(interview.websockets, "connect", fake_connect)
    monkeypatch.setattr(interview, "get_ws_url", lambda: "wss://volcano.example/ws")
    monkeypatch.setattr(interview, "get_ws_connect_config", lambda: {})
    monkeypatch.setattr(
        interview,
        "build_full_client_request",
        lambda language="zh", uid="", sequence=1: b"init",
    )
    monkeypatch.setattr(interview, "parse_server_response", fake_parse)

    await interview.websocket_stt_proxy(FakeClientWebSocket())

    assert sent == [
        {"type": "ready"},
        {
            "type": "transcript",
            "text": "你好世界",
            "is_final": True,
            "provider_final": True,
        },
    ]


@pytest.mark.asyncio
async def test_websocket_relay_forwards_provider_final_from_payload_msg_result_list(monkeypatch, caplog):
    import routers.interview as interview

    caplog.set_level(logging.INFO)
    sent = []

    class FakeClientWebSocket:
        async def accept(self):
            return None

        async def receive_text(self):
            return '{"type":"config","language":"zh"}'

        async def receive(self):
            raise interview.WebSocketDisconnect()

        async def send_json(self, payload):
            sent.append(payload)

    class FakeVolcanoWebSocket:
        def __init__(self):
            self._messages = [b"ack", b"result"]

        async def send(self, payload):
            return None

        async def recv(self):
            return self._messages.pop(0)

        async def close(self):
            return None

        def __aiter__(self):
            return self

        async def __anext__(self):
            if not self._messages:
                raise StopAsyncIteration
            return self._messages.pop(0)

    async def fake_connect(*args, **kwargs):
        return FakeVolcanoWebSocket()

    def fake_parse(data):
        if data == b"ack":
            return {"type": "ack"}
        return {
            "type": "result",
            "data": {
                "payload_msg": {
                    "result": [
                        {
                            "text": "你最大的缺点是什么",
                            "definite": False,
                        }
                    ]
                }
            },
        }

    monkeypatch.setattr(interview.websockets, "connect", fake_connect)
    monkeypatch.setattr(interview, "get_ws_url", lambda: "wss://volcano.example/ws")
    monkeypatch.setattr(interview, "get_ws_connect_config", lambda: {})
    monkeypatch.setattr(
        interview,
        "build_full_client_request",
        lambda language="zh", uid="", sequence=1: b"init",
    )
    monkeypatch.setattr(interview, "parse_server_response", fake_parse)

    await interview.websocket_stt_proxy(FakeClientWebSocket())

    assert sent == [
        {"type": "ready"},
        {
            "type": "transcript",
            "text": "你最大的缺点是什么",
            "is_final": False,
            "provider_final": False,
        },
    ]
    assert "stt_upstream_result events=1" in caplog.text
    assert "provider_final=False" in caplog.text


@pytest.mark.asyncio
async def test_websocket_relay_forwards_provider_final_true_from_payload_msg_result_list(monkeypatch, caplog):
    import routers.interview as interview

    caplog.set_level(logging.INFO)
    sent = []

    class FakeClientWebSocket:
        async def accept(self):
            return None

        async def receive_text(self):
            return '{"type":"config","language":"zh"}'

        async def receive(self):
            raise interview.WebSocketDisconnect()

        async def send_json(self, payload):
            sent.append(payload)

    class FakeVolcanoWebSocket:
        def __init__(self):
            self._messages = [b"ack", b"result"]

        async def send(self, payload):
            return None

        async def recv(self):
            return self._messages.pop(0)

        async def close(self):
            return None

        def __aiter__(self):
            return self

        async def __anext__(self):
            if not self._messages:
                raise StopAsyncIteration
            return self._messages.pop(0)

    async def fake_connect(*args, **kwargs):
        return FakeVolcanoWebSocket()

    def fake_parse(data):
        if data == b"ack":
            return {"type": "ack"}
        return {
            "type": "result",
            "data": {
                "payload_msg": {
                    "result": [
                        {
                            "text": "你觉得自己为什么适合这个岗位",
                            "definite": True,
                        }
                    ]
                }
            },
        }

    monkeypatch.setattr(interview.websockets, "connect", fake_connect)
    monkeypatch.setattr(interview, "get_ws_url", lambda: "wss://volcano.example/ws")
    monkeypatch.setattr(interview, "get_ws_connect_config", lambda: {})
    monkeypatch.setattr(
        interview,
        "build_full_client_request",
        lambda language="zh", uid="", sequence=1: b"init",
    )
    monkeypatch.setattr(interview, "parse_server_response", fake_parse)

    await interview.websocket_stt_proxy(FakeClientWebSocket())

    assert sent == [
        {"type": "ready"},
        {
            "type": "transcript",
            "text": "你觉得自己为什么适合这个岗位",
            "is_final": True,
            "provider_final": True,
        },
    ]
    assert "stt_upstream_result events=1" in caplog.text
    assert "provider_final=True" in caplog.text


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
    assert "copilot_answer first_chunk request_type=generate_answer model=gemini-3-flash-preview" in caplog.text
    assert "copilot_answer complete request_type=generate_answer model=gemini-3-flash-preview" in caplog.text


@pytest.mark.asyncio
async def test_generate_answer_detects_question_from_transcript_when_question_is_empty(monkeypatch, caplog):
    import routers.interview as interview

    caplog.set_level(logging.INFO)

    async def fake_detect_stream(*, transcript, context, language):
        assert transcript == "[interviewer] 你最大的缺点是什么？"
        assert context == "resume\n\njd"
        assert language == "zh"
        yield "[QUESTION]: 你最大的缺点是什么？"
        yield "[ANSWER]: 我会诚实回答。"

    monkeypatch.setattr(interview, "detect_question_and_answer_stream", fake_detect_stream)

    response = await interview.generate_answer(
        interview.GenerateAnswerRequest(
            question="",
            resume_context="resume",
            jd_context="jd",
            transcript_context="[interviewer] 你最大的缺点是什么？",
            language="zh",
        )
    )

    chunks = []
    async for chunk in response.body_iterator:
        if isinstance(chunk, bytes):
            chunks.append(chunk.decode())
        else:
            chunks.append(chunk)

    assert chunks == [
        "data: [QUESTION]: 你最大的缺点是什么？\n\n",
        "data: [ANSWER]: 我会诚实回答。\n\n",
        "data: [DONE]\n\n",
    ]
    assert "copilot_answer request_type=detect_question_and_answer model=gemini-3-flash-preview" in caplog.text


@pytest.mark.asyncio
async def test_detect_question_returns_only_question_text(monkeypatch):
    import routers.interview as interview

    async def fake_detect_stream(*, transcript, context, language):
        assert transcript == "[interviewer] 你最大的缺点是什么？"
        assert context == "resume\n\njd"
        assert language == "zh"
        yield "[QUESTION]: 你最大的缺点是什么？"
        yield "[ANSWER]: 我会诚实回答。"

    monkeypatch.setattr(interview, "detect_question_and_answer_stream", fake_detect_stream)

    response = await interview.detect_question(
        interview.GenerateAnswerRequest(
            question="",
            resume_context="resume",
            jd_context="jd",
            transcript_context="[interviewer] 你最大的缺点是什么？",
            language="zh",
        )
    )

    assert response == {"question": "你最大的缺点是什么？"}


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
