import os
import base64
import numpy as np
import logging
from backend import config

logger = logging.getLogger(__name__)

# Lazy loaded pipeline
_pipeline = None

def get_kokoro_pipeline():
    global _pipeline
    if _pipeline is None:
        try:
            from kokoro import KPipeline
            # lang_code='a' for American English
            logger.info("Initializing Kokoro TTS KPipeline...")
            _pipeline = KPipeline(lang_code='a')
            logger.info("Kokoro TTS KPipeline initialized successfully.")
        except Exception as e:
            logger.error(
                f"Failed to initialize local Kokoro TTS. Please make sure 'espeak-ng' "
                f"is installed and added to PATH on Windows. Error: {e}"
            )
            _pipeline = False # Flag that we tried and failed
    return _pipeline

def pcm_to_mulaw(pcm_data: bytes) -> bytes:
    """Converts 16-bit PCM audio to 8-bit Mu-law audio."""
    try:
        import audioop
        return audioop.lin2ulaw(pcm_data, 2)
    except ImportError:
        # Fallback manual mu-law algorithm if audioop is not present (e.g. Python 3.13+)
        # Standard G.711 mu-law table/algorithm
        import math
        mulaw = bytearray()
        # Decode pcm bytes to list of int16
        samples = np.frombuffer(pcm_data, dtype=np.int16)
        for sample in samples:
            # Scale 16-bit to 14-bit signed
            sgn = 0
            if sample < 0:
                sample = -sample
                sgn = 0x80
            if sample > 32635:
                sample = 32635
            sample += 84
            
            exponent = 0
            if sample >= 16384:
                exponent = 7
            elif sample >= 8192:
                exponent = 6
            elif sample >= 4096:
                exponent = 5
            elif sample >= 2048:
                exponent = 4
            elif sample >= 1024:
                exponent = 3
            elif sample >= 512:
                exponent = 2
            elif sample >= 256:
                exponent = 1
                
            mantissa = (sample >> (exponent + 3)) & 0x0F
            ulaw_byte = ~(sgn | (exponent << 4) | mantissa) & 0xFF
            mulaw.append(ulaw_byte)
        return bytes(mulaw)

def generate_tts_audio_base64(text: str, voice: str = "af_bella") -> str:
    """
    Synthesizes speech from text and returns a base64 encoded string of Mu-law audio at 8000Hz.
    """
    pipeline = get_kokoro_pipeline()
    
    if pipeline:
        try:
            logger.info(f"Synthesizing text using Kokoro: '{text}'")
            generator = pipeline(text, voice=voice, speed=1.0)
            
            # Collect all audio segments
            all_audio = []
            for _, _, audio in generator:
                if audio is not None and len(audio) > 0:
                    all_audio.append(audio)
            
            if all_audio:
                # Concatenate segments
                audio_np = np.concatenate(all_audio)
                
                # Resample: Kokoro output is 24000Hz. Twilio expects 8000Hz.
                # Decimate by taking every 3rd sample (24000 -> 8000)
                audio_8000 = audio_np[::3]
                
                # Convert float32 [-1.0, 1.0] to signed int16 [-32768, 32767]
                audio_int16 = (audio_8000 * 32767).astype(np.int16)
                pcm_bytes = audio_int16.tobytes()
                
                # Convert 16-bit PCM (8000Hz) to 8-bit Mu-law (8000Hz)
                mulaw_bytes = pcm_to_mulaw(pcm_bytes)
                
                # Encode to base64 for Twilio
                return base64.b64encode(mulaw_bytes).decode('utf-8')
        except Exception as e:
            logger.error(f"Error during Kokoro audio synthesis/conversion: {e}")
            
    # Fallback to Generating a Mock Beep / Simple Sine wave in Mu-law 
    # if Kokoro is not installed or errors out
    logger.warning("Falling back to generating a mock audio beep for Twilio.")
    return generate_mock_beeps()

def generate_mock_beeps() -> str:
    """Generates 1 second of 440Hz sine wave encoded in Mu-law base64."""
    sample_rate = 8000
    duration = 1.5  # seconds
    frequency = 440.0
    t = np.linspace(0, duration, int(sample_rate * duration), endpoint=False)
    # Generate 16-bit PCM sine wave
    amplitude = 16000
    audio_data = (amplitude * np.sin(2 * np.pi * frequency * t)).astype(np.int16)
    pcm_bytes = audio_data.tobytes()
    mulaw_bytes = pcm_to_mulaw(pcm_bytes)
    return base64.b64encode(mulaw_bytes).decode('utf-8')
