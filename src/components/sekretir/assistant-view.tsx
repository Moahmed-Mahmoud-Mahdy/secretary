'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Bot, Check, Loader2, Square, Volume2, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { AiInput } from '@/components/sekretir/ai-input';
import {
  apiErrorMessage,
  endpoints,
  type AiChatResponse,
  type AiExecutedAction,
  type AiPendingAction,
} from '@/lib/sekretir/api';
import { CHAT_STORAGE_KEY } from '@/lib/sekretir/constants';
import { cn } from '@/lib/utils';

// ============================================================
// Client-side chat message model
// ============================================================

interface ChatMsg {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  executed?: AiExecutedAction[];
  pending?: AiPendingAction[];
}

function newId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

const WELCOME: ChatMsg = {
  id: 'welcome',
  role: 'assistant',
  text: 'أنا سكرتيرك الشخصي 🤖\nقولّي أي حاجة بالمصري العادي:\n• «دفعت 50 جنيه مواصلات»\n• «بكرة عندي محاضرة الساعة 10»\n• «عايز أذاكر ساعتين بكرة»\n• «نظملي يومي»\n• «قد إيه صرفت الشهر ده؟»',
};

const ACTION_ICON: Record<string, string> = {
  CREATE_TASK: '✅',
  CREATE_EVENT: '📅',
  CREATE_EXPENSE: '💸',
  CREATE_INCOME: '💵',
  SET_BUDGET: '💰',
  CREATE_PROJECT: '📁',
  COMPLETE_TASK: '🎉',
  DELETE_TASK: '🗑️',
  UPDATE_TASK: '✏️',
  DELETE_EVENT: '🗑️',
  PLAN_DAY: '🪄',
  QUERY: '🔎',
  CHITCHAT: '💬',
};

interface AssistantViewProps {
  queuedMessage: string | null;
  onQueuedConsumed: () => void;
  onExecutedChange: () => void;
}

export function AssistantView({
  queuedMessage,
  onQueuedConsumed,
  onExecutedChange,
}: AssistantViewProps) {
  const [messages, setMessages] = useState<ChatMsg[]>([WELCOME]);
  const [input, setInput] = useState('');
  const [thinking, setThinking] = useState(false);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [speakingId, setSpeakingId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const loadedRef = useRef(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Load from localStorage once
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(CHAT_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as ChatMsg[];
        if (Array.isArray(parsed) && parsed.length > 0) {
          setMessages(parsed);
        }
      }
    } catch {
      /* corrupted storage — ignore */
    }
    loadedRef.current = true;
  }, []);

  // Persist on change
  useEffect(() => {
    if (!loadedRef.current) return;
    try {
      window.localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(messages));
    } catch {
      /* storage full — ignore */
    }
  }, [messages]);

  // Auto-scroll to bottom
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }, [messages, thinking]);

  const send = useCallback(
    async (raw: string) => {
      const message = raw.trim();
      if (!message || thinking) return;
      setInput('');
      const userMsg: ChatMsg = { id: newId(), role: 'user', text: message };
      setMessages((prev) => [...prev, userMsg]);
      setThinking(true);
      try {
        const res: AiChatResponse = await endpoints.chat(message);
        const aiMsg: ChatMsg = {
          id: newId(),
          role: 'assistant',
          text: res.reply,
          executed: res.executed?.length ? res.executed : undefined,
          pending: res.pending?.length ? res.pending : undefined,
        };
        setMessages((prev) => [...prev, aiMsg]);
        if (res.executed?.length) onExecutedChange();
        if (res.failed?.length) toast.error('في جزء من الكلام معرفتش أطبقه 😅');
      } catch (e) {
        toast.error(apiErrorMessage(e));
        setMessages((prev) => [
          ...prev,
          { id: newId(), role: 'assistant', text: 'عارذني، حصلت مشكلة في الاتصال... جرب تاني 🙏' },
        ]);
      } finally {
        setThinking(false);
      }
    },
    [thinking, onExecutedChange]
  );

  // Handle queued messages coming from other views (e.g. "نظملي يومي")
  useEffect(() => {
    if (queuedMessage) {
      void send(queuedMessage);
      onQueuedConsumed();
    }
  }, [queuedMessage, send, onQueuedConsumed]);

  async function confirmPending(msgId: string, pending: AiPendingAction) {
    setConfirmingId(pending.id);
    try {
      const res = await endpoints.execute(pending);
      // Backend returns a single action object (not an array) — normalize.
      const executed = Array.isArray(res.executed)
        ? res.executed
        : res.executed
          ? [res.executed]
          : [];
      const summaries = executed.map((a) => a.summary).join('، ');
      setMessages((prev) =>
        prev.map((m) =>
          m.id === msgId
            ? {
                ...m,
                pending: m.pending?.filter((p) => p.id !== pending.id),
                executed: [...(m.executed ?? []), ...executed],
                text: summaries ? `${m.text}\n${summaries}`.trim() : m.text,
              }
            : m
        )
      );
      toast.success('تم التنفيذ ✅');
      onExecutedChange();
    } catch (e) {
      toast.error(apiErrorMessage(e));
    } finally {
      setConfirmingId(null);
    }
  }

  function cancelPending(msgId: string, pending: AiPendingAction) {
    setMessages((prev) =>
      prev.map((m) =>
        m.id === msgId ? { ...m, pending: m.pending?.filter((p) => p.id !== pending.id) } : m
      )
    );
    toast('تمام، مأثرتش حاجة 👌');
  }

  async function stopSpeaking() {
    audioRef.current?.pause();
    audioRef.current = null;
    setSpeakingId(null);
  }

  /** سكرتير يتكلم — TTS voice replies (BRD §43). */
  async function speakMessage(msgId: string, text: string) {
    if (speakingId === msgId) {
      await stopSpeaking();
      return;
    }
    await stopSpeaking();
    setSpeakingId(msgId);
    try {
      const { audio, mimeType } = await endpoints.speak(text);
      const element = new Audio(`data:${mimeType};base64,${audio}`);
      audioRef.current = element;
      element.onended = () => {
        if (audioRef.current === element) setSpeakingId(null);
      };
      await element.play();
    } catch (e) {
      setSpeakingId(null);
      toast.error(apiErrorMessage(e) || 'معرفتش أشغّل الصوت 😅');
    }
  }

  return (
    <div className="flex flex-col h-[calc(100dvh-3.5rem-env(safe-area-inset-bottom))] md:h-[calc(100dvh-3.5rem-3rem)] max-h-full">
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto sekretir-scroll px-1 py-3 space-y-3"
        role="log"
        aria-label="محادثة سكرتير"
      >
        {messages.map((m) => (
          <div key={m.id} className="sekretir-msg">
            {m.role === 'user' ? (
              <div className="flex justify-start">
                <div className="max-w-[85%] sm:max-w-[70%] whitespace-pre-wrap rounded-2xl rounded-ss-sm bg-amber-600 text-white px-4 py-2.5 text-sm shadow-sm">
                  {m.text}
                </div>
              </div>
            ) : (
              <div className="flex justify-end gap-2 items-end">
                <div className="max-w-[88%] sm:max-w-[75%] space-y-2">
                  <div className="whitespace-pre-wrap rounded-2xl rounded-se-sm bg-white border border-stone-200 px-4 py-2.5 text-sm text-stone-800 shadow-sm group relative">
                    {m.text}
                    <button
                      type="button"
                      aria-label={speakingId === m.id ? 'وقف الصوت' : 'اسمع الرد بصوت سكرتير'}
                      disabled={speakingId === m.id && !audioRef.current}
                      onClick={() => speakMessage(m.id, m.text)}
                      className="absolute -top-2 -start-2 size-6 rounded-full bg-white border border-stone-200 shadow-sm flex items-center justify-center text-amber-600 hover:bg-amber-50 hover:border-amber-300 transition-colors"
                    >
                      {speakingId === m.id ? (
                        audioRef.current ? (
                          <Square className="size-3 animate-pulse" />
                        ) : (
                          <Loader2 className="size-3 animate-spin" />
                        )
                      ) : (
                        <Volume2 className="size-3" />
                      )}
                    </button>
                  </div>

                  {m.executed?.map((a, i) => (
                    <div
                      key={`${m.id}-exec-${i}`}
                      className="flex items-center gap-2 rounded-xl border border-emerald-100 bg-emerald-50/60 px-3 py-2 text-xs text-emerald-800"
                    >
                      <span aria-hidden>{ACTION_ICON[a.type] ?? '⚡'}</span>
                      <span className="flex-1">{a.summary}</span>
                    </div>
                  ))}

                  {m.pending?.map((p) => (
                    <div
                      key={`${m.id}-pending-${p.id}`}
                      className="rounded-xl border-2 border-amber-300 bg-amber-50 px-3 py-2.5"
                    >
                      <p className="text-xs font-bold text-amber-800 mb-1">
                        محتاج تأكيد منك: {p.title}
                      </p>
                      <p className="text-xs text-amber-700 mb-2">{p.summary}</p>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          className="h-7 bg-emerald-600 hover:bg-emerald-700 text-white text-xs"
                          disabled={confirmingId === p.id}
                          onClick={() => confirmPending(m.id, p)}
                        >
                          <Check className="size-3" />
                          تأكيد ✅
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 border-stone-300 text-stone-600 hover:bg-stone-100 text-xs"
                          onClick={() => cancelPending(m.id, p)}
                        >
                          <X className="size-3" />
                          إلغاء ❌
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
                <div
                  className="size-8 rounded-full bg-white border border-stone-200 flex items-center justify-center shrink-0 shadow-sm"
                  aria-hidden
                >
                  <Bot className="size-4 text-amber-600" />
                </div>
              </div>
            )}
          </div>
        ))}

        {thinking ? (
          <div className="flex justify-end" aria-label="سكرتير بيفكر">
            <div className="flex items-center gap-2">
              <div className="bg-white border border-stone-200 rounded-2xl rounded-se-sm px-4 py-3 shadow-sm flex items-center gap-1">
                <span className="sekretir-dot size-1.5 rounded-full bg-stone-400 inline-block" />
                <span className="sekretir-dot size-1.5 rounded-full bg-stone-400 inline-block" />
                <span className="sekretir-dot size-1.5 rounded-full bg-stone-400 inline-block" />
              </div>
            </div>
          </div>
        ) : null}
      </div>

      <div className="pt-2 pb-1">
        <AiInput
          value={input}
          onChange={setInput}
          onSend={send}
          disabled={thinking}
          placeholder="اكتب لسكرتير بالمصري..."
        />
      </div>
    </div>
  );
}
