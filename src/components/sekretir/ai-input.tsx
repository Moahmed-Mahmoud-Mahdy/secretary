'use client';

import { useEffect, useRef, useState } from 'react';
import { Loader2, Mic, Send, Sparkles, Square, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { apiErrorMessage, endpoints } from '@/lib/sekretir/api';
import { cn } from '@/lib/utils';

// ============================================================
// Audio helpers: MediaRecorder blob → 16kHz mono WAV → base64
// ============================================================

function resampleTo16k(data: Float32Array, origRate: number): Float32Array {
  if (origRate === 16000) return data;
  const ratio = origRate / 16000;
  const outLen = Math.max(1, Math.floor(data.length / ratio));
  const out = new Float32Array(outLen);
  for (let i = 0; i < outLen; i++) {
    const pos = i * ratio;
    const idx = Math.floor(pos);
    const frac = pos - idx;
    const a = data[idx] ?? 0;
    const b = data[idx + 1] ?? a;
    out[i] = a + (b - a) * frac;
  }
  return out;
}

function encodeWav(samples: Float32Array, sampleRate: number): ArrayBuffer {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  const writeString = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i));
  };
  writeString(0, 'RIFF');
  view.setUint32(4, 36 + samples.length * 2, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(36, 'data');
  view.setUint32(40, samples.length * 2, true);
  let offset = 44;
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    offset += 2;
  }
  return buffer;
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

async function blobToWavBase64(blob: Blob): Promise<string> {
  const arrayBuffer = await blob.arrayBuffer();
  const Ctx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new Ctx();
  let audioBuffer: AudioBuffer;
  try {
    audioBuffer = await ctx.decodeAudioData(arrayBuffer);
  } finally {
    void ctx.close();
  }
  // Downmix to mono
  const chCount = audioBuffer.numberOfChannels;
  let mono: Float32Array;
  if (chCount === 1) {
    mono = audioBuffer.getChannelData(0);
  } else {
    const len = audioBuffer.length;
    mono = new Float32Array(len);
    for (let c = 0; c < chCount; c++) {
      const data = audioBuffer.getChannelData(c);
      for (let i = 0; i < len; i++) mono[i] += data[i] / chCount;
    }
  }
  const resampled = resampleTo16k(mono, audioBuffer.sampleRate);
  const wav = encodeWav(resampled, 16000);
  return arrayBufferToBase64(wav);
}

function formatRecordTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

// ============================================================
// AiInput — unified text + voice input (Mobile-optimized UX)
// ============================================================

interface AiInputProps {
  value: string;
  onChange: (v: string) => void;
  onSend: (text: string) => void | Promise<void>;
  disabled?: boolean;
  placeholder?: string;
  autoFocus?: boolean;
}

export function AiInput({
  value,
  onChange,
  onSend,
  disabled,
  placeholder = 'بتفكر تعمل إيه النهارده؟',
  autoFocus,
}: AiInputProps) {
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [recordTime, setRecordTime] = useState(0);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Timer while recording
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (recording) {
      setRecordTime(0);
      interval = setInterval(() => {
        setRecordTime((t) => t + 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [recording]);

  // Safety auto-stop at 60s
  useEffect(() => {
    if (recordTime >= 60 && recording) {
      stopRecording();
      toast('أقصى مدة تسجيل 60 ثانية 🎙️');
    }
  }, [recordTime, recording]);

  async function startRecording() {
    // Blur input to smoothly dismiss mobile soft keyboard before recording
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mimeType = MediaRecorder.isTypeSupported('audio/webm')
        ? 'audio/webm'
        : MediaRecorder.isTypeSupported('audio/mp4')
          ? 'audio/mp4'
          : '';
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => void handleStopped();
      recorderRef.current = recorder;
      recorder.start();
      setRecording(true);
      toast.info('بتسجل... اتكلم ودوس على المربع لما تخلص 🎙️');
    } catch {
      toast.error('لازم تسمحلي أستخدم الميكروفون 🎤');
    }
  }

  function stopRecording() {
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== 'inactive') {
      recorder.stop();
    } else {
      setRecording(false);
    }
  }

  function cancelRecording() {
    if (recorderRef.current) {
      recorderRef.current.onstop = null;
      if (recorderRef.current.state !== 'inactive') {
        recorderRef.current.stop();
      }
    }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    recorderRef.current = null;
    chunksRef.current = [];
    setRecording(false);
    toast('تم إلغاء التسجيل 🛑');
  }

  async function handleStopped() {
    setRecording(false);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    const blob = new Blob(chunksRef.current, {
      type: recorderRef.current?.mimeType || 'audio/webm',
    });
    if (blob.size < 1200) {
      toast.error('مسمعتش صوت واضح... جرب تاني 😅');
      return;
    }
    setTranscribing(true);
    try {
      const audio = await blobToWavBase64(blob);
      const { text } = await endpoints.transcribe(audio);
      const clean = text.trim();
      if (!clean) {
        toast.error('معرفتش أفهم الصوت... قولها تاني 🙏');
        return;
      }
      onChange(clean);
      await onSend(clean);
    } catch (e) {
      toast.error(apiErrorMessage(e));
    } finally {
      setTranscribing(false);
      recorderRef.current = null;
    }
  }

  function submit() {
    const text = value.trim();
    if (!text || disabled || recording || transcribing) return;
    onSend(text);
  }

  return (
    <div
      className={cn(
        'relative w-full max-w-full flex items-center gap-2 bg-white border border-stone-200 rounded-full shadow-sm transition-all duration-300 pl-1.5 pr-2 sm:pr-3 py-1.5 min-h-[48px] overflow-hidden',
        recording &&
          'border-rose-400 ring-4 ring-rose-500/10 bg-rose-50/40 shadow-md',
        transcribing &&
          'border-amber-400 ring-4 ring-amber-500/10 bg-amber-50/40 shadow-md'
      )}
    >
      {/* Recording active view */}
      {recording ? (
        <div className="flex-1 flex items-center justify-between px-2 gap-2 min-w-0">
          <div className="flex items-center gap-2 min-w-0">
            <span className="size-2.5 rounded-full bg-rose-500 animate-pulse shrink-0" />
            <span className="text-xs font-bold text-rose-700 font-mono shrink-0">
              {formatRecordTime(recordTime)}
            </span>
            <span className="text-xs font-medium text-stone-600 truncate hidden xs:inline">
              اتكلم بالمصري...
            </span>
          </div>

          {/* Equalizer Waveform Animation */}
          <div className="flex items-center gap-1 shrink-0 px-1" aria-hidden>
            <span className="w-1 h-3 bg-rose-500 rounded-full animate-bounce [animation-duration:0.8s] [animation-delay:0.1s]" />
            <span className="w-1 h-5 bg-rose-500 rounded-full animate-bounce [animation-duration:0.8s] [animation-delay:0.3s]" />
            <span className="w-1 h-2 bg-rose-500 rounded-full animate-bounce [animation-duration:0.8s] [animation-delay:0.2s]" />
            <span className="w-1 h-6 bg-rose-500 rounded-full animate-bounce [animation-duration:0.8s] [animation-delay:0.4s]" />
            <span className="w-1 h-4 bg-rose-500 rounded-full animate-bounce [animation-duration:0.8s] [animation-delay:0.15s]" />
          </div>

          {/* Cancel recording button */}
          <Button
            type="button"
            size="icon"
            onClick={cancelRecording}
            variant="ghost"
            className="size-8 rounded-full text-stone-400 hover:text-rose-600 hover:bg-rose-100/60 shrink-0"
            title="إلغاء التسجيل"
            aria-label="إلغاء التسجيل"
          >
            <X className="size-4" />
          </Button>
        </div>
      ) : transcribing ? (
        /* Transcribing processing view */
        <div className="flex-1 flex items-center gap-2 px-3 min-w-0">
          <Sparkles className="size-4 text-amber-600 animate-spin shrink-0" />
          <span className="text-xs font-semibold text-amber-800 truncate">
            جاري تحويل صوتك وتنفيذ الطلب...
          </span>
        </div>
      ) : (
        /* Normal text input view */
        <Input
          ref={inputRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.nativeEvent.isComposing) submit();
          }}
          placeholder={placeholder}
          disabled={disabled || recording || transcribing}
          autoFocus={autoFocus}
          data-sekretir-chat-input
          className="border-0 shadow-none focus-visible:ring-0 bg-transparent text-base h-10 flex-1 px-1 sm:px-2"
          aria-label="اكتب لسكرتير"
        />
      )}

      {/* Mic / Stop Action Button */}
      {recording || transcribing ? (
        <Button
          type="button"
          size="icon"
          disabled={transcribing}
          onClick={stopRecording}
          className="relative size-10 rounded-full bg-rose-600 hover:bg-rose-700 text-white shrink-0 overflow-hidden shadow-sm flex items-center justify-center transition-transform active:scale-95"
          aria-label="وقّف التسجيل وابعت"
        >
          {transcribing ? (
            <Loader2 className="size-4 animate-spin relative z-10" />
          ) : (
            <>
              <span className="absolute inset-0 rounded-full bg-rose-500 opacity-60 animate-ping" />
              <Square className="size-4 fill-current relative z-10" />
            </>
          )}
        </Button>
      ) : (
        <Button
          type="button"
          size="icon"
          disabled={disabled}
          onClick={startRecording}
          variant="ghost"
          className="size-10 rounded-full text-stone-500 hover:text-amber-700 hover:bg-amber-50 shrink-0 transition-all active:scale-95"
          aria-label="سجل بصوتك"
        >
          <Mic className="size-5" />
        </Button>
      )}

      {/* Send Text Button */}
      <Button
        type="button"
        size="icon"
        onClick={submit}
        disabled={disabled || recording || transcribing || !value.trim()}
        className="size-10 rounded-full bg-amber-600 hover:bg-amber-700 text-white shrink-0 transition-transform active:scale-95"
        aria-label="ابعت"
      >
        <Send className="size-4 -scale-x-100" />
      </Button>
    </div>
  );
}
