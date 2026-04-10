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
  interviewerTranscript: string;
  userTranscript: string;
  interimTranscript: string;
  segments: TranscriptSegment[];
  startListening: (language: string) => void;
  stopListening: () => void;
  resetTranscript: () => void;
  isSupported: boolean;
  error: string | null;
  hasSystemAudio: boolean;
}

type SessionState = {
  ws: WebSocket | null;
  audioContext: AudioContext | null;
  processor: ScriptProcessorNode | null;
  source: MediaStreamAudioSourceNode | null;
  gain: GainNode | null;
};

const EMPTY_SESSION: SessionState = {
  ws: null,
  audioContext: null,
  processor: null,
  source: null,
  gain: null,
};

/**
 * Hook for dual-stream Volcano STT:
 * - Microphone -> `user`
 * - Tab/system audio via getDisplayMedia -> `interviewer`
 */
export function useVolcanoSTT(): UseVolcanoSTTReturn {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [interviewerTranscript, setInterviewerTranscript] = useState('');
  const [userTranscript, setUserTranscript] = useState('');
  const [interimTranscript, setInterimTranscript] = useState('');
  const [segments, setSegments] = useState<TranscriptSegment[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [hasSystemAudio, setHasSystemAudio] = useState(false);

  const segmentIdRef = useRef(0);
  const isListeningRef = useRef(false);
  const stopRequestedRef = useRef(false);

  const micStreamRef = useRef<MediaStream | null>(null);
  const displayStreamRef = useRef<MediaStream | null>(null);
  const sessionsRef = useRef<Record<Speaker, SessionState>>({
    interviewer: { ...EMPTY_SESSION },
    user: { ...EMPTY_SESSION },
  });
  const committedRef = useRef<Record<Speaker, string>>({
    interviewer: '',
    user: '',
  });
  const liveRef = useRef<Record<Speaker, string>>({
    interviewer: '',
    user: '',
  });

  const isSupported =
    typeof navigator !== 'undefined' &&
    !!navigator.mediaDevices?.getUserMedia &&
    !!navigator.mediaDevices?.getDisplayMedia;

  const syncTranscriptState = useCallback(() => {
    const nextUser = `${committedRef.current.user}${liveRef.current.user}`.trim();
    const nextInterviewer = `${committedRef.current.interviewer}${liveRef.current.interviewer}`.trim();

    setUserTranscript(nextUser);
    setInterviewerTranscript(nextInterviewer);

    const combined = [nextInterviewer ? `[interviewer] ${nextInterviewer}` : '', nextUser ? `[user] ${nextUser}` : '']
      .filter(Boolean)
      .join(' ');
    setTranscript(combined.trim());
  }, []);

  const getWebSocketUrl = (): string => {
    const baseUrl = getAPIBaseURL();

    if (typeof window !== 'undefined') {
      const pageHost = window.location.host;
      const pageProtocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
      const apiUrl = new URL(baseUrl);
      const isLocalApi = apiUrl.hostname === '127.0.0.1' || apiUrl.hostname === 'localhost';
      const isLocalPage = window.location.hostname === '127.0.0.1' || window.location.hostname === 'localhost';

      if (isLocalApi && isLocalPage) {
        return `${pageProtocol}://${pageHost}/api/v1/interview/ws-stt`;
      }
    }

    const wsProtocol = baseUrl.startsWith('https') ? 'wss' : 'ws';
    const wsHost = baseUrl.replace(/^https?:\/\//, '');
    return `${wsProtocol}://${wsHost}/api/v1/interview/ws-stt`;
  };

  const float32ToInt16 = (buffer: Float32Array): ArrayBuffer => {
    const int16 = new Int16Array(buffer.length);
    for (let i = 0; i < buffer.length; i++) {
      const s = Math.max(-1, Math.min(1, buffer[i]));
      int16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }
    return int16.buffer;
  };

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

  const teardownSession = useCallback((speaker: Speaker) => {
    const session = sessionsRef.current[speaker];

    if (session.processor) {
      session.processor.disconnect();
      session.processor = null;
    }

    if (session.source) {
      session.source.disconnect();
      session.source = null;
    }

    if (session.gain) {
      session.gain.disconnect();
      session.gain = null;
    }

    if (session.audioContext) {
      session.audioContext.close().catch(() => undefined);
      session.audioContext = null;
    }

    if (session.ws) {
      session.ws.close();
      session.ws = null;
    }
  }, []);

  const handleTranscript = useCallback((speaker: Speaker, text: string, isFinal: boolean) => {
    const trimmed = text.trim();
    if (!trimmed) return;

    liveRef.current[speaker] = trimmed;
    setInterimTranscript(`[${speaker}] ${trimmed}`);

    if (isFinal) {
      committedRef.current[speaker] = `${committedRef.current[speaker]} ${trimmed}`.trim() + ' ';
      liveRef.current[speaker] = '';
      setSegments((prev) => [
        ...prev,
        {
          id: segmentIdRef.current++,
          text: trimmed,
          timestamp: Date.now(),
          isFinal: true,
          speaker,
        },
      ]);
      setInterimTranscript('');
    }

    syncTranscriptState();
  }, [syncTranscriptState]);

  const startAudioProcessing = useCallback((speaker: Speaker, audioCtx: AudioContext, stream: MediaStream) => {
    const source = audioCtx.createMediaStreamSource(stream);
    const processor = audioCtx.createScriptProcessor(4096, 1, 1);
    const gain = audioCtx.createGain();
    gain.gain.value = 0;

    sessionsRef.current[speaker].source = source;
    sessionsRef.current[speaker].processor = processor;
    sessionsRef.current[speaker].gain = gain;

    processor.onaudioprocess = (e) => {
      const session = sessionsRef.current[speaker];
      if (!isListeningRef.current || !session.ws) return;
      if (session.ws.readyState !== WebSocket.OPEN) return;

      const inputData = e.inputBuffer.getChannelData(0);
      const downsampled = downsample(inputData, audioCtx.sampleRate, 16000);
      const pcmData = float32ToInt16(downsampled);
      session.ws.send(pcmData);
    };

    source.connect(processor);
    processor.connect(gain);
    gain.connect(audioCtx.destination);
  }, []);

  const connectSpeakerStream = useCallback((speaker: Speaker, stream: MediaStream, language: string) => {
    const audioCtx = new AudioContext({ sampleRate: 16000 });
    sessionsRef.current[speaker].audioContext = audioCtx;

    const wsUrl = getWebSocketUrl();
    const ws = new WebSocket(wsUrl);
    sessionsRef.current[speaker].ws = ws;

    ws.onopen = () => {
      ws.send(JSON.stringify({ type: 'config', language }));
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'ready') {
          startAudioProcessing(speaker, audioCtx, stream);
          return;
        }

        if (data.type === 'transcript') {
          handleTranscript(speaker, data.text || '', data.is_final || false);
          return;
        }

        if (data.type === 'error') {
          setError(`STT error (${speaker}): ${data.text}`);
        }
      } catch {
        // Ignore malformed websocket messages.
      }
    };

    ws.onerror = () => {
      if (stopRequestedRef.current || !isListeningRef.current) {
        return;
      }
      setError(`WebSocket connection error: ${wsUrl}`);
    };
  }, [handleTranscript, startAudioProcessing]);

  const startListening = useCallback(async (language: string = 'zh') => {
    setError(null);
    stopRequestedRef.current = false;

    try {
      const micStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: 16000,
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      });
      micStreamRef.current = micStream;

      const displayStream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: true,
      });

      displayStream.getVideoTracks().forEach((track) => track.stop());
      if (displayStream.getAudioTracks().length === 0) {
        throw new Error('Screen/tab audio is required to capture the interviewer.');
      }

      displayStreamRef.current = displayStream;
      setHasSystemAudio(true);

      isListeningRef.current = true;
      setIsListening(true);

      connectSpeakerStream('user', micStream, language);
      connectSpeakerStream('interviewer', displayStream, language);
    } catch (err) {
      console.error('Audio capture error:', err);
      const message = err instanceof Error ? err.message : 'Failed to start audio capture.';
      setError(message);
      stopRequestedRef.current = true;
      isListeningRef.current = false;
      setIsListening(false);
      setHasSystemAudio(false);
      teardownSession('user');
      teardownSession('interviewer');
      if (micStreamRef.current) {
        micStreamRef.current.getTracks().forEach((track) => track.stop());
        micStreamRef.current = null;
      }
      if (displayStreamRef.current) {
        displayStreamRef.current.getTracks().forEach((track) => track.stop());
        displayStreamRef.current = null;
      }
    }
  }, [connectSpeakerStream, teardownSession]);

  const stopListening = useCallback(() => {
    isListeningRef.current = false;
    stopRequestedRef.current = true;

    (['user', 'interviewer'] as Speaker[]).forEach((speaker) => {
      const session = sessionsRef.current[speaker];
      if (session.ws && session.ws.readyState === WebSocket.OPEN) {
        try {
          session.ws.send(JSON.stringify({ type: 'stop' }));
        } catch {
          // ignore
        }
      }
    });

    setTimeout(() => {
      teardownSession('user');
      teardownSession('interviewer');
    }, 1500);

    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach((track) => track.stop());
      micStreamRef.current = null;
    }

    if (displayStreamRef.current) {
      displayStreamRef.current.getTracks().forEach((track) => track.stop());
      displayStreamRef.current = null;
    }

    setHasSystemAudio(false);
    setIsListening(false);
    setInterimTranscript('');
  }, [teardownSession]);

  const resetTranscript = useCallback(() => {
    committedRef.current = { interviewer: '', user: '' };
    liveRef.current = { interviewer: '', user: '' };
    setTranscript('');
    setInterviewerTranscript('');
    setUserTranscript('');
    setInterimTranscript('');
    setSegments([]);
    segmentIdRef.current = 0;
  }, []);

  useEffect(() => {
    return () => {
      stopRequestedRef.current = true;
      isListeningRef.current = false;
      teardownSession('user');
      teardownSession('interviewer');
      if (micStreamRef.current) {
        micStreamRef.current.getTracks().forEach((track) => track.stop());
      }
      if (displayStreamRef.current) {
        displayStreamRef.current.getTracks().forEach((track) => track.stop());
      }
    };
  }, [teardownSession]);

  return {
    isListening,
    transcript,
    interviewerTranscript,
    userTranscript,
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
