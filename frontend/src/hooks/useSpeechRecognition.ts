import { useState, useRef, useCallback, useEffect } from 'react';

export type Speaker = 'interviewer' | 'user';

export interface TranscriptSegment {
  id: number;
  text: string;
  timestamp: number;
  isFinal: boolean;
  speaker: Speaker;
}

interface UseSpeechRecognitionReturn {
  isListening: boolean;
  transcript: string;
  interimTranscript: string;
  segments: TranscriptSegment[];
  startListening: () => void;
  stopListening: () => void;
  resetTranscript: () => void;
  isSupported: boolean;
  error: string | null;
  /** Get the latest audio blob for Gemini multimodal analysis */
  getLatestAudioBlob: () => Blob | null;
  /** Whether system audio (interviewer) is being captured */
  hasSystemAudio: boolean;
}

// Get the SpeechRecognition constructor (cross-browser)
const SpeechRecognitionAPI =
  typeof window !== 'undefined'
    ? (window as unknown as Record<string, unknown>).SpeechRecognition ||
      (window as unknown as Record<string, unknown>).webkitSpeechRecognition
    : null;

/**
 * Hook that captures dual audio sources:
 * - Microphone (user) via Web Speech API for real-time local transcription
 * - System/browser audio (interviewer) via getDisplayMedia
 * - Combined audio recording for Gemini multimodal analysis
 */
export function useSpeechRecognition(): UseSpeechRecognitionReturn {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [interimTranscript, setInterimTranscript] = useState('');
  const [segments, setSegments] = useState<TranscriptSegment[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [hasSystemAudio, setHasSystemAudio] = useState(false);

  const segmentIdRef = useRef(0);
  const isListeningRef = useRef(false);

  // Web Speech API for local transcription display
  const micRecognitionRef = useRef<InstanceType<typeof SpeechRecognitionAPI> | null>(null);

  // MediaStream references
  const micStreamRef = useRef<MediaStream | null>(null);
  const displayStreamRef = useRef<MediaStream | null>(null);

  // MediaRecorder for capturing combined audio for Gemini
  const recorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const latestAudioBlobRef = useRef<Blob | null>(null);

  const isSupported =
    typeof navigator !== 'undefined' &&
    !!navigator.mediaDevices?.getUserMedia &&
    !!SpeechRecognitionAPI;

  /**
   * Create and configure a SpeechRecognition instance for local transcription.
   */
  const createRecognition = useCallback(
    (speaker: Speaker) => {
      if (!SpeechRecognitionAPI) return null;

      const recognition = new SpeechRecognitionAPI();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'en-US';
      recognition.maxAlternatives = 1;

      recognition.onresult = (event: {
        resultIndex: number;
        results: {
          length: number;
          [index: number]: {
            isFinal: boolean;
            [index: number]: { transcript: string };
          };
        };
      }) => {
        let finalText = '';
        let interimText = '';

        for (let i = event.resultIndex; i < event.results.length; i++) {
          const result = event.results[i];
          const text = result[0].transcript;

          if (result.isFinal) {
            finalText += text;
          } else {
            interimText += text;
          }
        }

        if (interimText) {
          const label = speaker === 'interviewer' ? '🎙️ Interviewer' : '🗣️ You';
          setInterimTranscript(`[${label}] ${interimText}`);
        }

        if (finalText.trim()) {
          const newSegment: TranscriptSegment = {
            id: segmentIdRef.current++,
            text: finalText.trim(),
            timestamp: Date.now(),
            isFinal: true,
            speaker,
          };
          setSegments((prev) => [...prev, newSegment]);
          setTranscript((prev) => prev + `[${speaker}] ${finalText.trim()} `);
          setInterimTranscript('');
        }
      };

      recognition.onerror = (event: { error: string }) => {
        if (event.error === 'aborted' || event.error === 'no-speech') return;
        console.error(`Speech recognition error (${speaker}):`, event.error);
        if (speaker === 'user') {
          setError(`Speech recognition error: ${event.error}`);
        }
      };

      recognition.onend = () => {
        if (isListeningRef.current) {
          try {
            recognition.start();
          } catch {
            // Already started or stopped
          }
        }
      };

      return recognition;
    },
    [],
  );

  /**
   * Start a MediaRecorder to capture combined audio for Gemini analysis.
   * Merges mic + system audio into one stream if both available.
   */
  const startAudioRecording = useCallback(
    (micStream: MediaStream, displayStream: MediaStream | null) => {
      try {
        let combinedStream: MediaStream;

        if (displayStream && displayStream.getAudioTracks().length > 0) {
          // Merge mic + system audio using AudioContext
          const audioCtx = new AudioContext();
          const destination = audioCtx.createMediaStreamDestination();

          const micSource = audioCtx.createMediaStreamSource(micStream);
          micSource.connect(destination);

          const displaySource = audioCtx.createMediaStreamSource(displayStream);
          displaySource.connect(destination);

          combinedStream = destination.stream;
        } else {
          combinedStream = micStream;
        }

        const recorder = new MediaRecorder(combinedStream, {
          mimeType: 'audio/webm;codecs=opus',
        });

        audioChunksRef.current = [];

        recorder.ondataavailable = (event) => {
          if (event.data.size > 0) {
            audioChunksRef.current.push(event.data);
            // Build latest blob from all accumulated chunks
            latestAudioBlobRef.current = new Blob(
              [...audioChunksRef.current],
              { type: 'audio/webm;codecs=opus' },
            );
          }
        };

        // Record in 4-second slices for periodic Gemini analysis
        recorder.start(4000);
        recorderRef.current = recorder;
      } catch (err) {
        console.error('Failed to start audio recording:', err);
      }
    },
    [],
  );

  const getLatestAudioBlob = useCallback((): Blob | null => {
    const blob = latestAudioBlobRef.current;
    // Reset after retrieval so next call gets fresh audio
    audioChunksRef.current = [];
    latestAudioBlobRef.current = null;
    return blob;
  }, []);

  const startListening = useCallback(async () => {
    setError(null);

    if (!SpeechRecognitionAPI) {
      setError(
        'Speech recognition is not supported in this browser. Please use Chrome or Edge.',
      );
      return;
    }

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

        // Remove video tracks - we only need audio
        displayStream.getVideoTracks().forEach((track) => track.stop());

        if (displayStream.getAudioTracks().length === 0) {
          console.warn('No audio track from screen share.');
          displayStream = null;
        } else {
          setHasSystemAudio(true);
        }
      } catch (displayErr) {
        console.warn('Screen share declined. Only microphone will be used.', displayErr);
        displayStream = null;
      }
      displayStreamRef.current = displayStream;

      isListeningRef.current = true;
      setIsListening(true);

      // 3. Start Web Speech API for local real-time transcription
      const micRecognition = createRecognition('user');
      if (micRecognition) {
        micRecognitionRef.current = micRecognition;
        micRecognition.start();
      }

      // 4. Start audio recording for Gemini multimodal analysis
      startAudioRecording(micStream, displayStream);

      // 5. Listen for display audio track ended
      if (displayStream) {
        displayStream.getAudioTracks().forEach((track) => {
          track.onended = () => {
            console.log('Display audio track ended');
            setHasSystemAudio(false);
            displayStreamRef.current = null;
          };
        });
      }
    } catch (err) {
      console.error('Audio capture error:', err);
      setError('Failed to start. Please check microphone permissions.');
      isListeningRef.current = false;
      setIsListening(false);
    }
  }, [createRecognition, startAudioRecording]);

  const stopListening = useCallback(() => {
    isListeningRef.current = false;

    if (micRecognitionRef.current) {
      try {
        micRecognitionRef.current.stop();
      } catch {
        // ignore
      }
      micRecognitionRef.current = null;
    }

    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      try {
        recorderRef.current.stop();
      } catch {
        // ignore
      }
      recorderRef.current = null;
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
    audioChunksRef.current = [];
    latestAudioBlobRef.current = null;
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      isListeningRef.current = false;
      if (micRecognitionRef.current) {
        try {
          micRecognitionRef.current.stop();
        } catch {
          // ignore
        }
      }
      if (recorderRef.current && recorderRef.current.state !== 'inactive') {
        try {
          recorderRef.current.stop();
        } catch {
          // ignore
        }
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
    getLatestAudioBlob,
    hasSystemAudio,
  };
}