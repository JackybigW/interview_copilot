"""Volcano Engine Streaming STT service via WebSocket proxy."""

import os
import json
import uuid
import gzip
import logging
from typing import AsyncGenerator

logger = logging.getLogger(__name__)

VOLC_APP_ID = os.environ.get("VOLC_APP_ID", "")
VOLC_ACCESS_TOKEN = os.environ.get("VOLC_ACCESS_TOKEN", "")
VOLC_RESOURCE_ID = "volc.seedasr.sauc.concurrent"
VOLC_WS_URL = "wss://openspeech.bytedance.com/api/v3/sauc/bigmodel"

# Protocol constants for Volcano Engine binary protocol
PROTOCOL_VERSION = 0b0001
HEADER_SIZE = 0b0001  # 4 bytes
FULL_CLIENT_REQUEST = 0b0001
AUDIO_ONLY_REQUEST = 0b0010
FULL_SERVER_RESPONSE = 0b1001
SERVER_ACK = 0b1011
SERVER_ERROR_RESPONSE = 0b1111
NO_SEQUENCE = 0b0000
POS_SEQUENCE = 0b0001
NEG_SEQUENCE = 0b0010
NEG_WITH_SEQUENCE = 0b0011
NO_SERIALIZATION = 0b0000
JSON_SERIALIZATION = 0b0001
NO_COMPRESSION = 0b0000
GZIP_COMPRESSION = 0b0001


def _build_header(
    message_type: int,
    serial_method: int = JSON_SERIALIZATION,
    compression: int = GZIP_COMPRESSION,
    extension: bytes = b"\x00\x00\x00\x00",
) -> bytes:
    """Build the 4-byte binary header for Volcano protocol."""
    header = bytearray()
    # byte 0: protocol_version (4 bits) + header_size (4 bits)
    header.append((PROTOCOL_VERSION << 4) | HEADER_SIZE)
    # byte 1: message_type (4 bits) + serial_method (4 bits)
    header.append((message_type << 4) | serial_method)
    # byte 2: compression (4 bits) + reserved (4 bits)
    header.append((compression << 4) | 0x00)
    # byte 3: reserved
    header.append(0x00)
    # extension header (4 bytes)
    header.extend(extension)
    return bytes(header)


def build_full_client_request(
    language: str = "zh-CN",
    uid: str = "",
) -> bytes:
    """Build the initial full client request with config."""
    if not uid:
        uid = str(uuid.uuid4())

    # Map language codes
    lang_map = {
        "zh": "zh-CN",
        "en": "en-US",
        "mixed": "zh-CN",  # Use Chinese as primary for mixed mode
    }
    resolved_lang = lang_map.get(language, language)

    payload = {
        "user": {
            "uid": uid,
        },
        "audio": {
            "format": "opus",
            "codec": "opus",
            "rate": 16000,
            "bits": 16,
            "channel": 1,
        },
        "request": {
            "model_name": "bigmodel",
            "enable_punc": True,
            "result_type": "single",
            "vad": {
                "end_window_size": 800,
            },
            "language": resolved_lang,
        },
    }

    payload_bytes = json.dumps(payload).encode("utf-8")
    compressed = gzip.compress(payload_bytes)

    header = _build_header(
        message_type=FULL_CLIENT_REQUEST,
        serial_method=JSON_SERIALIZATION,
        compression=GZIP_COMPRESSION,
    )

    # payload size (4 bytes big-endian)
    size_bytes = len(compressed).to_bytes(4, "big")

    return header + size_bytes + compressed


def build_audio_request(audio_data: bytes, is_last: bool = False) -> bytes:
    """Build an audio-only request frame."""
    seq_flag = NEG_SEQUENCE if is_last else POS_SEQUENCE

    header = bytearray()
    header.append((PROTOCOL_VERSION << 4) | HEADER_SIZE)
    header.append((AUDIO_ONLY_REQUEST << 4) | NO_SERIALIZATION)
    header.append((NO_COMPRESSION << 4) | seq_flag)
    header.append(0x00)
    # extension
    header.extend(b"\x00\x00\x00\x00")
    # payload size
    size_bytes = len(audio_data).to_bytes(4, "big")

    return bytes(header) + size_bytes + audio_data


def parse_server_response(data: bytes) -> dict:
    """Parse a binary server response from Volcano Engine."""
    if len(data) < 8:
        return {"type": "error", "text": "Response too short"}

    # Parse header
    msg_type = (data[1] >> 4) & 0x0F
    serial_method = data[1] & 0x0F
    compression = (data[2] >> 4) & 0x0F
    seq_flag = data[2] & 0x0F

    # Skip header (4 bytes) + extension (4 bytes)
    offset = 8

    if msg_type == SERVER_ACK:
        return {"type": "ack"}

    if msg_type == SERVER_ERROR_RESPONSE:
        # Read error code (4 bytes) + payload size (4 bytes)
        if len(data) >= offset + 8:
            error_code = int.from_bytes(data[offset : offset + 4], "big")
            payload_size = int.from_bytes(data[offset + 4 : offset + 8], "big")
            offset += 8
            if payload_size > 0 and len(data) >= offset + payload_size:
                payload_bytes = data[offset : offset + payload_size]
                if compression == GZIP_COMPRESSION:
                    try:
                        payload_bytes = gzip.decompress(payload_bytes)
                    except Exception:
                        pass
                try:
                    error_msg = payload_bytes.decode("utf-8")
                except Exception:
                    error_msg = str(payload_bytes)
                return {"type": "error", "code": error_code, "text": error_msg}
        return {"type": "error", "code": -1, "text": "Unknown error"}

    if msg_type == FULL_SERVER_RESPONSE:
        # Read payload size (4 bytes)
        if len(data) < offset + 4:
            return {"type": "error", "text": "Incomplete response"}

        # Check for sequence number
        if seq_flag in (POS_SEQUENCE, NEG_SEQUENCE, NEG_WITH_SEQUENCE):
            # sequence number (4 bytes)
            if len(data) >= offset + 4:
                offset += 4

        payload_size = int.from_bytes(data[offset : offset + 4], "big")
        offset += 4

        if payload_size == 0:
            return {"type": "empty"}

        if len(data) < offset + payload_size:
            return {"type": "error", "text": "Payload truncated"}

        payload_bytes = data[offset : offset + payload_size]

        if compression == GZIP_COMPRESSION:
            try:
                payload_bytes = gzip.decompress(payload_bytes)
            except Exception:
                pass

        if serial_method == JSON_SERIALIZATION:
            try:
                result = json.loads(payload_bytes.decode("utf-8"))
                return {"type": "result", "data": result}
            except (json.JSONDecodeError, UnicodeDecodeError):
                return {"type": "error", "text": "Failed to parse JSON"}

        return {"type": "raw", "data": payload_bytes}

    return {"type": "unknown", "msg_type": msg_type}


def get_ws_url() -> str:
    """Get the WebSocket URL with auth parameters."""
    return f"{VOLC_WS_URL}?appid={VOLC_APP_ID}&token={VOLC_ACCESS_TOKEN}&cluster={VOLC_RESOURCE_ID}"