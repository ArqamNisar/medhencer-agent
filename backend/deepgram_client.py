import json
import asyncio
import logging
import websockets
from backend import config

logger = logging.getLogger(__name__)

class DeepgramStreamClient:
    """
    Manages a real-time streaming connection to Deepgram via raw WebSockets.
    Pipes mu-law audio from Twilio directly to Deepgram and triggers a callback
    when finalized transcripts are received.
    """
    def __init__(self, on_transcript_callback):
        self.api_key = config.DEEPGRAM_API_KEY
        self.on_transcript_callback = on_transcript_callback
        self.ws = None
        self.listen_task = None
        self.connected = False

    async def connect(self) -> bool:
        if not self.api_key:
            logger.error("DEEPGRAM_API_KEY is not configured.")
            return False

        # Query parameters optimized for Twilio phone call stream
        # - model=nova-2-phonecall: Deepgram's best model for telephone audio
        # - encoding=mulaw: Twilio audio codec
        # - sample_rate=8000: Twilio audio sample rate
        # - channels=1: Mono audio
        # - interim_results=false: Only receive finalized sentences (reduces voice processing chatter)
        # - endpointing=500: Wait for 500ms of silence to determine end of utterance
        url = (
            "wss://api.deepgram.com/v1/listen"
            "?model=nova-2-phonecall"
            "&encoding=mulaw"
            "&sample_rate=8000"
            "&channels=1"
            "&interim_results=false"
            "&endpointing=500"
        )
        headers = {
            "Authorization": f"Token {self.api_key}"
        }

        try:
            logger.info("Connecting to Deepgram streaming WebSocket...")
            self.ws = await websockets.connect(url, extra_headers=headers)
            self.connected = True
            self.listen_task = asyncio.create_task(self._listen_loop())
            logger.info("Successfully connected to Deepgram stream.")
            return True
        except Exception as e:
            logger.error(f"Failed to connect to Deepgram: {e}")
            self.connected = False
            return False

    async def send_audio(self, chunk: bytes):
        """Sends a raw binary chunk of audio to Deepgram."""
        if not self.connected or not self.ws:
            return
        try:
            await self.ws.send(chunk)
        except Exception as e:
            logger.error(f"Error sending audio to Deepgram: {e}")
            await self.close()

    async def close(self):
        """Closes the Deepgram WebSocket connection."""
        if not self.connected:
            return
        
        self.connected = False
        logger.info("Closing Deepgram streaming connection...")
        try:
            if self.ws:
                # Send close signal to Deepgram
                await self.ws.send(json.dumps({"type": "CloseStream"}))
                await self.ws.close()
        except Exception as e:
            logger.error(f"Error sending close signal to Deepgram: {e}")
        
        if self.listen_task:
            self.listen_task.cancel()
            try:
                await self.listen_task
            except asyncio.CancelledError:
                pass

    async def _listen_loop(self):
        """Listens for transcription messages from Deepgram."""
        try:
            async for message in self.ws:
                data = json.loads(message)
                
                # Extract transcript
                channel = data.get("channel", {})
                alternatives = channel.get("alternatives", [])
                is_final = data.get("is_final", False)
                
                if alternatives:
                    transcript = alternatives[0].get("transcript", "").strip()
                    # We check is_final to ensure the user finished their statement
                    if transcript and is_final:
                        logger.info(f"Deepgram transcript (final): '{transcript}'")
                        # Trigger the async callback with the transcription
                        if asyncio.iscoroutinefunction(self.on_transcript_callback):
                            await self.on_transcript_callback(transcript)
                        else:
                            self.on_transcript_callback(transcript)
                            
        except asyncio.CancelledError:
            logger.info("Deepgram listener loop task cancelled.")
        except Exception as e:
            logger.error(f"Error reading from Deepgram WebSocket: {e}")
            self.connected = False
