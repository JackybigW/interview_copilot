import pytest


@pytest.mark.asyncio
async def test_websocket_stt_proxy_disables_upstream_proxy(monkeypatch):
    import routers.interview as interview

    captured = {}

    class FakeClientWebSocket:
        async def accept(self):
            return None

        async def receive_text(self):
            return '{"type":"config","language":"zh"}'

        async def receive(self):
            raise interview.WebSocketDisconnect()

        async def send_json(self, payload):
            captured.setdefault("client_messages", []).append(payload)

    class FakeVolcanoWebSocket:
        async def send(self, payload):
            captured.setdefault("volcano_payloads", []).append(payload)

        async def recv(self):
            return b"ack"

        async def close(self):
            captured["closed"] = True

        def __aiter__(self):
            return self

        async def __anext__(self):
            raise StopAsyncIteration

    fake_volcano_ws = FakeVolcanoWebSocket()

    async def fake_connect(url, **kwargs):
        captured["url"] = url
        captured["connect_kwargs"] = kwargs
        return fake_volcano_ws

    monkeypatch.setattr(interview.websockets, "connect", fake_connect)
    monkeypatch.setattr(interview, "get_ws_url", lambda: "wss://volcano.example/ws")
    monkeypatch.setattr(
        interview,
        "build_full_client_request",
        lambda language="zh", uid="", sequence=1: b"init",
    )
    monkeypatch.setattr(interview, "parse_server_response", lambda data: {"type": "ack"})

    await interview.websocket_stt_proxy(FakeClientWebSocket())

    assert captured["url"] == "wss://volcano.example/ws"
    assert captured["connect_kwargs"]["proxy"] is None
    assert captured["connect_kwargs"]["ping_interval"] is None
    assert captured["client_messages"] == [{"type": "ready"}]
