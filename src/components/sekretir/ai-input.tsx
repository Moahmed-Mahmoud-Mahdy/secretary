'use client';

import { useRef, useState } from 'react';
import { Loader2, Mic, Send, Square } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { apiErrorMessage, endpoints } from '@/lib/sekretir/api';

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

// ============================================================
// AiInput — unified text + voice input
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
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);

  async function startRecording() {
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
      toast('بتسجل... دوس تاني لما تخلص 🎙️');
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
    <div className="flex items-center gap-2 bg-white border border-stone-200 rounded-full shadow-sm pl-1.5 pr-4 py-1.5">
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.nativeEvent.isComposing) submit();
        }}
        placeholder={placeholder}
        disabled={disabled || recording || transcribing}
        autoFocus={autoFocus}
        className="border-0 shadow-none focus-visible:ring-0 bg-transparent text-base h-10 flex-1 px-0"
        aria-label="اكتب لسكرتير"
      />
      {recording || transcribing ? (
        <Button
          type="button"
          size="icon"
          disabled={transcribing}
          onClick={stopRecording}
          className="size-10 rounded-full bg-rose-600 hover:bg-rose-700 text-white shrink-0"
          aria-label="وقّف التسجيل"
        >
          {transcribing ? (
            <Loader2 className="size-4 animate-spin" />
          ) : recording ? (
            <>
              <span className="absolute inline-flex h-full w-full rounded-full bg-rose-500 opacity-60 animate-ping" />
              <Square className="size-4 fill-current relative" />
            </>
          ) : null}
        </Button>
      ) : (
        <Button
          type="button"
          size="icon"
          disabled={disabled}
          onClick={startRecording}
          variant="ghost"
          className="size-10 rounded-full text-stone-500 hover:text-amber-700 hover:bg-amber-50 shrink-0"
          aria-label="سجل بصوتك"
        >
          <Mic className="size-5" />
        </Button>
      )}
      <Button
        type="button"
        size="icon"
        onClick={submit}
        disabled={disabled || recording || transcribing || !value.trim()}
        className="size-10 rounded-full bg-amber-600 hover:bg-amber-700 text-white shrink-0"
        aria-label="ابعت"
      >
        <Send className="size-4 -scale-x-100" />
      </Button>
    </div>
  );
}
