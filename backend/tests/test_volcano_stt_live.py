import asyncio
import os

import pytest
import websockets

from services.volcano_stt_service import get_ws_connect_config, get_ws_url


pytestmark = pytest.mark.skipif(
    os.environ.get("RUN_VOLCANO_STT_LIVE") != "1",
    reason="Set RUN_VOLCANO_STT_LIVE=1 to run the live Volcano STT handshake test.",
)


@pytest.mark.asyncio
async def test_volcano_stt_live_handshake():
    async with websockets.connect(
        get_ws_url(),
        proxy=None,
        open_timeout=10,
        **get_ws_connect_config(),
    ) as ws:
        await ws.close()
