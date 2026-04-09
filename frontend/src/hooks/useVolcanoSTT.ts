import { useState, useRef, useCallback, useEffect } from 'react';
import { getAPIBaseURL } from '@/lib/config';

export type Speaker = 'interviewer' | 'user';

export interface TranscriptSegment {
  id: number;
  text: string;
  timestamp: number;
  isFinal: boolean;
  speaker: Speaker;
}

interface UseVolcanoSTTReturn {
  isListening: boolean;
  transcript: string;
  interimTranscript: string;
  segments: TranscriptSegment[];
  startListening: (language: string) => void;
  stopListening: () => void;
  resetTranscript: () => void;
  isSupported: boolean;
  error: string | null;
  hasSystemAudio: boolean;
}

/**
 * Hook for Volcano Engine streaming STT via WebSocket proxy.
 * Captures mic (user) + system audio (interviewer via screen share),
 * sends audio to backend WebSocket which proxies to Volcano Engine.
 */
export function useVolcanoSTT(): UseVolcanoSTTReturn {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [interimTranscript, setInterimTranscript] = useState('');
  const [segments, setSegments] = useState<TranscriptSegment[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [hasSystemAudio, setHasSystemAudio] = useState(false);

  const segmentIdRef = useRef(0);
  const isListeningRef = useRef(false);

  // WebSocket
  const wsRef = useRef<WebSocket | null>(null);

  // MediaStream references
  const micStreamRef = useRef<MediaStream | null>(null);
  const displayStreamRef = useRef<MediaStream | null>(null);

  // Audio processing
  const audioContextRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);

  const isSupported =
    typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;

  /**
   * Convert Float32Array PCM to 16-bit PCM bytes
   */
  const float32ToInt16 = (buffer: Float32Array): ArrayBuffer => {
    const int16 = new Int16Array(buffer.length);
    for (let i = 0; i < buffer.length; i++) {
      const s = Math.max(-1, Math.min(1, buffer[i]));
      int16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }
    return int16.buffer;
  };

  /**
   * Downsample audio from source rate to target rate
   */
  const downsample = (
    buffer: Float32Array,
    sourceRate: number,
    targetRate: number,
  ): Float32Array => {
    if (sourceRate === targetRate) return buffer;
    const ratio = sourceRate / targetRate;
    const newLength = Math.round(buffer.length / ratio);
    const result = new Float32Array(newLength);
    for (let i = 0; i < newLength; i++) {
      const idx = Math.round(i * ratio);
      result[i] = buffer[idx] || 0;
    }
    return result;
  };

  const startListening = useCallback(
    async (language: string = 'zh') => {
      setError(null);

      try {
        // 1. Capture microphone
        const micStream = await navigator.mediaDevices.getUserMedia({
          audio: {
            channelCount: 1,
            sampleRate: 16000,
            echoCancellation: true,
            noiseSuppression: true,
          },
        });
        micStreamRef.current = micStream;

        // 2. Try to capture system/browser audio (interviewer)
        let displayStream: MediaStream | null = null;
        try {
          displayStream = await navigator.mediaDevices.getDisplayMedia({
            video: true,
            audio: true,
          });
          // Remove video tracks
          displayStream.getVideoTracks().forEach((track) => track.stop());
          if (displayStream.getAudioTracks().length === 0) {
            displayStream = null;
          } else {
            setHasSystemAudio(true);
          }
        } catch {
          displayStream = null;
        }
        displayStreamRef.current = displayStream;

        // 3. Create AudioContext and merge streams
        const audioCtx = new AudioContext({ sampleRate: 16000 });
        audioContextRef.current = audioCtx;

        const destination = audioCtx.createMediaStreamDestination();
        const micSource = audioCtx.createMediaStreamSource(micStream);
        micSource.connect(destination);

        if (displayStream) {
          const displaySource =
            audioCtx.createMediaStreamSource(displayStream);
          displaySource.connect(destination);

          displayStream.getAudioTracks().forEach((track) => {
            track.onended = () => {
              setHasSystemAudio(false);
              displayStreamRef.current = null;
            };
          });
        }

        // 4. Connect to backend WebSocket
        const baseUrl = getAPIBaseURL();
        const wsProtocol = baseUrl.startsWith('https') ? 'wss' : 'ws';
        const wsHost = baseUrl.replace(/^https?:\/\//, '');
        const wsUrl = `${wsProtocol}://${wsHost}/api/v1/interview/ws-stt`;

        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onopen = () => {
          // Send config
          ws.send(JSON.stringify({ type: 'config', language }));
        };

        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            if (data.type === 'ready') {
              // Start sending audio
              startAudioProcessing(audioCtx, destination.stream);
            } else if (data.type === 'transcript') {
              const text = data.text || '';
              const isFinal = data.is_final || false;

              if (isFinal && text.trim()) {
                // Determine speaker heuristically - system audio = interviewer
                const speaker: Speaker = hasSystemAudio
                  ? 'interviewer'
                  : 'user';
                const newSegment: TranscriptSegment = {
                  id: segmentIdRef.current++,
                  text: text.trim(),
                  timestamp: Date.now(),
                  isFinal: true,
                  speaker,
                };
                setSegments((prev) => [...prev, newSegment]);
                setTranscript(
                  (prev) => prev + `[${speaker}] ${text.trim()} `,
                );
                setInterimTranscript('');
              } else if (text.trim()) {
                setInterimTranscript(text);
              }
            } else if (data.type === 'error') {
              console.error('STT error:', data.text);
              setError(`STT error: ${data.text}`);
            }
          } catch {
            // ignore parse errors
          }
        };

        ws.onerror = () => {
          setError('WebSocket connection error');
        };

        ws.onclose = () => {
          if (isListeningRef.current) {
            setIsListening(false);
            isListeningRef.current = false;
          }
        };

        isListeningRef.current = true;
        setIsListening(true);
      } catch (err) {
        console.error('Audio capture error:', err);
        setError('Failed to start. Please check microphone permissions.');
        isListeningRef.current = false;
        setIsListening(false);
      }
    },
    [hasSystemAudio],
  );

  const startAudioProcessing = (
    audioCtx: AudioContext,
    stream: MediaStream,
  ) => {
    const source = audioCtx.createMediaStreamSource(stream);
    // Use ScriptProcessorNode for raw PCM access
    const processor = audioCtx.createScriptProcessor(4096, 1, 1);
    processorRef.current = processor;

    processor.onaudioprocess = (e) => {
      if (!isListeningRef.current || !wsRef.current) return;
      if (wsRef.current.readyState !== WebSocket.OPEN) return;

      const inputData = e.inputBuffer.getChannelData(0);
      // Downsample to 16kHz if needed
      const downsampled = downsample(
        inputData,
        audioCtx.sampleRate,
        16000,
      );
      const pcmData = float32ToInt16(downsampled);
      wsRef.current.send(pcmData);
    };

    source.connect(processor);
    processor.connect(audioCtx.destination);
  };

  const stopListening = useCallback(() => {
    isListeningRef.current = false;

    // Send stop signal
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      try {
        wsRef.current.send(JSON.stringify({ type: 'stop' }));
      } catch {
        // ignore
      }
      setTimeout(() => {
        wsRef.current?.close();
        wsRef.current = null;
      }, 1500);
    }

    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current = null;
    }

    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }

    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach((track) => track.stop());
      micStreamRef.current = null;
    }

    if (displayStreamRef.current) {
      displayStreamRef.current.getTracks().forEach((track) => track.stop());
      displayStreamRef.current = null;
    }

    setIsListening(false);
    setInterimTranscript('');
    setHasSystemAudio(false);
  }, []);

  const resetTranscript = useCallback(() => {
    setTranscript('');
    setInterimTranscript('');
    setSegments([]);
    segmentIdRef.current = 0;
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      isListeningRef.current = false;
      if (wsRef.current) {
        wsRef.current.close();
      }
      if (processorRef.current) {
        processorRef.current.disconnect();
      }
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
      if (micStreamRef.current) {
        micStreamRef.current.getTracks().forEach((track) => track.stop());
      }
      if (displayStreamRef.current) {
        displayStreamRef.current.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  return {
    isListening,
    transcript,
    interimTranscript,
    segments,
    startListening,
    stopListening,
    resetTranscript,
    isSupported,
    error,
    hasSystemAudio,
  };
}