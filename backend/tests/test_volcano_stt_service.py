import importlib
import gzip
import json


def test_get_ws_connect_config_uses_header_auth(monkeypatch):
    monkeypatch.setenv("VOLC_APP_ID", "7000161563")
    monkeypatch.setenv("VOLC_ACCESS_TOKEN", "token-123")
    monkeypatch.setenv("VOLC_RESOURCE_ID", "resource-abc")

    import services.volcano_stt_service as volcano_stt_service

    module = importlib.reload(volcano_stt_service)

    assert module.get_ws_url() == "wss://openspeech.bytedance.com/api/v3/sauc/bigmodel"
    assert module.get_ws_connect_config() == {
        "additional_headers": {
            "X-Api-App-Key": "7000161563",
            "X-Api-Access-Key": "token-123",
            "X-Api-Resource-Id": "resource-abc",
        }
    }


def test_build_full_client_request_declares_pcm_audio():
    import services.volcano_stt_service as volcano_stt_service

    payload = volcano_stt_service.build_full_client_request("zh", sequence=1)
    assert payload[2] & 0x0F == volcano_stt_service.POS_SEQUENCE
    assert int.from_bytes(payload[4:8], "big", signed=True) == 1
    compressed = payload[12:]
    decoded = json.loads(gzip.decompress(compressed).decode("utf-8"))

    assert decoded["audio"]["format"] == "pcm"
    assert "codec" not in decoded["audio"]


def test_build_audio_request_uses_raw_uncompressed_audio():
    import services.volcano_stt_service as volcano_stt_service

    payload = volcano_stt_service.build_audio_request(b"\x01\x02", sequence=2, is_last=False)
    assert (payload[2] >> 4) == volcano_stt_service.NO_COMPRESSION
    assert payload[2] & 0x0F == 0
    body_size = int.from_bytes(payload[4:8], "big")
    body = payload[8:]
    assert body_size == len(body)
    assert body == b"\x01\x02"


def test_parse_server_response_reads_error_payload():
    import binascii
    import services.volcano_stt_service as volcano_stt_service

    raw = binascii.unhexlify(
        "11f0100002aea540000000857b226572726f72223a226465636f6465207773207265717565737420"
        "6661696c65643a20756e61626c6520746f206465636f64652056312070726f746f636f6c206d6573"
        "736167653a206175746f41737369676e656453657175656e636520283129206d69736d6174636820"
        "73657175656e636520696e207265717565737420283029227d"
    )

    parsed = volcano_stt_service.parse_server_response(raw)

    assert parsed["type"] == "error"
    assert "autoAssignedSequence" in parsed["text"]


def test_parse_server_response_reads_plain_json_result_even_when_compression_flag_set():
    import binascii
    import services.volcano_stt_service as volcano_stt_service

    raw = binascii.unhexlify(
        "11911000000000010000006e7b22617564696f5f696e666f223a7b226475726174696f6e223a307d"
        "2c22726573756c74223a7b226164646974696f6e73223a7b226c6f675f6964223a22323032363034"
        "30393137353935374230373935393242444344364431444546323843227d2c2274657874223a2222"
        "7d7d"
    )

    parsed = volcano_stt_service.parse_server_response(raw)

    assert parsed["type"] == "result"
    assert parsed["data"]["result"]["text"] == ""
