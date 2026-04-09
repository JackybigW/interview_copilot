import pytest


def test_get_client_is_cached(monkeypatch):
    import services.gemini_flash_service as flash_service

    calls = []

    class FakeClient:
        def __init__(self, api_key):
            self.api_key = api_key

    def fake_client_factory(api_key):
        calls.append(api_key)
        return FakeClient(api_key)

    monkeypatch.setenv("GEMINI_API_KEY", "cache-test-key")
    monkeypatch.setattr(flash_service.genai, "Client", fake_client_factory)
    flash_service._get_client.cache_clear()

    client1 = flash_service._get_client()
    client2 = flash_service._get_client()

    assert client1 is client2
    assert calls == ["cache-test-key"]


@pytest.mark.asyncio
async def test_generate_answer_stream_uses_flash_model(monkeypatch):
    import services.gemini_flash_service as flash_service

    calls = []

    class FakeModels:
        def generate_content_stream(self, **kwargs):
            calls.append(kwargs)

            class _Response:
                def __iter__(self_inner):
                    yield type("Chunk", (), {"text": "hello"})()

            return _Response()

    class FakeClient:
        def __init__(self):
            self.models = FakeModels()

    monkeypatch.setattr(flash_service, "_get_client", lambda: FakeClient())

    chunks = []
    async for chunk in flash_service.generate_answer_stream("Question?", context="Context"):
        chunks.append(chunk)

    assert chunks == ["hello"]
    assert calls[0]["model"] == "gemini-3-flash-preview"
