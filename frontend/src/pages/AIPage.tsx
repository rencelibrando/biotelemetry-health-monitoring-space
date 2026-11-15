import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowUp, ArrowUpRight, Check, Copy, Mic, MicOff, Sparkles, User, Volume2, VolumeX, WifiOff } from 'lucide-react';
import { flightAssistant, type AssistantContext, type AssistantMode } from '../services/ai';
import {
  isSpeechSynthesisSupported,
  isTtsPlaybackSupported,
  isVoiceDictationSupported,
  preloadSpeechVoices,
  primeAudioPlayback,
  speakAssistantReply,
  startVoiceDictation,
  stopSpeaking,
} from '../services/voiceAssistant';
import type { SelfExamType } from '../types/telemetry';
import type { AssistantAction, AssistantReply, Page } from '../types/wellness';
import { PageHeading } from '../components/AppShell';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text?: string;
  reply?: AssistantReply;
}

const questions = [
  'How is my blood sugar and metabolic trend?',
  'What does my SANS / eye and radiation status show?',
  'What countermeasures should I prioritize today?',
];

const conversationCache = new Map<string, ChatMessage[]>();

function buildSpokenSummary(reply: AssistantReply): string {
  return [reply.facts, reply.explanation, reply.action]
    .map(part => part.trim())
    .filter(Boolean)
    .map(part => (/[.!?]$/.test(part) ? part : `${part}.`))
    .join(' ');
}

export interface StreamReplySlice {
  facts: string;
  explanation: string;
  action: string;
  showExplanation: boolean;
  showAction: boolean;
  complete: boolean;
  totalChars: number;
  activeSection: 'facts' | 'explanation' | 'action' | 'done';
}

export function computeDisplayCharWeights(reply: AssistantReply): number[] {
  const segments = [reply.facts, reply.explanation, reply.action];
  const cumulative: number[] = [];
  let total = 0;

  segments.forEach((segment, segIdx) => {
    for (let i = 0; i < segment.length; i++) {
      const ch = segment[i];
      let weight = 1;
      if (/\s/.test(ch)) weight = 0.45;
      else if (/[.!?]/.test(ch)) weight = 4.2;
      else if (/[,;:]/.test(ch)) weight = 2.6;
      if (segIdx < segments.length - 1 && i === segment.length - 1) {
        weight += 3.5;
      }
      total += weight;
      cumulative.push(total);
    }
  });

  return cumulative;
}

export function charCountForStreamRatio(cumulativeWeights: number[], ratio: number): number {
  const totalChars = cumulativeWeights.length;
  if (totalChars === 0) return 0;
  if (!Number.isFinite(ratio) || ratio <= 0) return 0;
  if (ratio >= 1) return totalChars;

  const totalWeight = cumulativeWeights[totalChars - 1];
  const targetWeight = totalWeight * ratio;
  let lo = 0;
  let hi = totalChars - 1;
  let count = 0;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (cumulativeWeights[mid] <= targetWeight) {
      count = mid + 1;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return count;
}

export function sliceReplyForStream(
  reply: AssistantReply,
  revealedChars?: number,
): StreamReplySlice {
  const factsLen = reply.facts.length;
  const explanationLen = reply.explanation.length;
  const actionLen = reply.action.length;
  const totalChars = factsLen + explanationLen + actionLen;

  if (revealedChars === undefined || revealedChars >= totalChars) {
    return {
      facts: reply.facts,
      explanation: reply.explanation,
      action: reply.action,
      showExplanation: Boolean(reply.explanation),
      showAction: Boolean(reply.action),
      complete: true,
      totalChars,
      activeSection: 'done',
    };
  }

  const clamped = Math.max(0, Math.floor(revealedChars));
  const facts = reply.facts.slice(0, Math.min(clamped, factsLen));
  const remAfterFacts = Math.max(0, clamped - factsLen);
  const explanation = reply.explanation.slice(0, Math.min(remAfterFacts, explanationLen));
  const remAfterExplanation = Math.max(0, remAfterFacts - explanationLen);
  const action = reply.action.slice(0, Math.min(remAfterExplanation, actionLen));

  const showExplanation = Boolean(reply.explanation) && (clamped > factsLen || factsLen === 0);
  const showAction = Boolean(reply.action) && (clamped > factsLen + explanationLen || (factsLen + explanationLen === 0));

  let activeSection: StreamReplySlice['activeSection'] = 'facts';
  if (clamped >= factsLen && explanationLen > 0 && clamped < factsLen + explanationLen) {
    activeSection = 'explanation';
  } else if (clamped >= factsLen + explanationLen && actionLen > 0) {
    activeSection = 'action';
  }

  return {
    facts,
    explanation,
    action,
    showExplanation,
    showAction,
    complete: false,
    totalChars,
    activeSection,
  };
}

export function AIMessage({
  message,
  ttsSupported = false,
  isSpeaking = false,
  streamedChars,
  waitingForTts = false,
  onToggleSpeak,
  onExecuteAction,
}: {
  message: ChatMessage;
  ttsSupported?: boolean;
  isSpeaking?: boolean;
  streamedChars?: number;
  waitingForTts?: boolean;
  onToggleSpeak?: () => void;
  onExecuteAction?: (action: AssistantAction) => void;
}) {
  const [copiedSbar, setCopiedSbar] = useState(false);
  const stream = message.reply ? sliceReplyForStream(message.reply, streamedChars) : null;

  async function copySbar(text: string) {
    try {
      await navigator.clipboard?.writeText(text);
      setCopiedSbar(true);
      setTimeout(() => setCopiedSbar(false), 2000);
    } catch {
      setCopiedSbar(false);
    }
  }

  return (
    <article className={`chat-message ${message.role}`}>
      <span className="message-avatar">
        {message.role === 'assistant' ? <Sparkles size={18} /> : <User size={18} />}
      </span>
      <div>
        <div className="message-header-row">
          <span className="message-author">
            {message.role === 'assistant'
              ? `Flight Surgeon AI · ${message.reply?.sourceLabel ?? 'onboard'}`
              : 'You'}
          </span>
          {message.role === 'assistant' && message.reply && ttsSupported && onToggleSpeak && (
            <button
              type="button"
              className="button secondary compact-btn"
              onClick={onToggleSpeak}
              aria-pressed={isSpeaking}
              aria-label={isSpeaking ? 'Stop reading reply aloud' : 'Read reply aloud'}
            >
              {isSpeaking ? <VolumeX size={14} /> : <Volume2 size={14} />}
              {isSpeaking ? 'Stop reading' : 'Read aloud'}
            </button>
          )}
        </div>
        {message.text && <p>{message.text}</p>}
        {message.reply && stream && (
          waitingForTts && stream.facts.length === 0 ? (
            <p className="thinking" role="status" style={{ marginTop: 12 }}>
              <Sparkles size={15} />
              Thinking…
            </p>
          ) : (
            <>
              <div className="reply-section">
                <strong>Clinical summary &amp; records</strong>
                <p>
                  {stream.facts}
                  {!stream.complete && stream.activeSection === 'facts' && (
                    <span className="typing-cursor" aria-hidden="true" />
                  )}
                </p>
              </div>
              {stream.showExplanation && (
                <div className="reply-section">
                  <strong>Recommended countermeasures</strong>
                  <p>
                    {stream.explanation}
                    {!stream.complete && stream.activeSection === 'explanation' && (
                      <span className="typing-cursor" aria-hidden="true" />
                    )}
                  </p>
                </div>
              )}
              {stream.showAction && (
                <div className="reply-section">
                  <strong>Next steps &amp; escalation</strong>
                  <p>
                    {stream.action}
                    {!stream.complete && stream.activeSection === 'action' && (
                      <span className="typing-cursor" aria-hidden="true" />
                    )}
                  </p>
                  {stream.complete && message.reply.nasaReference && (
                    <small className="muted" style={{ display: 'block', marginTop: 6 }}>
                      Reference: {message.reply.nasaReference}
                    </small>
                  )}
                  {stream.complete && message.reply.sbarText && (
                    <div className="sbar-card">
                      <div className="sbar-card-header">
                        <strong>Ground Downlink SBAR</strong>
                        <button
                          type="button"
                          className="button secondary compact-btn"
                          onClick={() => void copySbar(message.reply!.sbarText!)}
                        >
                          {copiedSbar ? <Check size={14} /> : <Copy size={14} />}
                          {copiedSbar ? 'Copied SBAR' : 'Copy SBAR'}
                        </button>
                      </div>
                      <pre>{message.reply.sbarText}</pre>
                    </div>
                  )}
                  {stream.complete && message.reply.suggestedActions && message.reply.suggestedActions.length > 0 && (
                    <div className="ai-action-row">
                      {message.reply.suggestedActions.map(action => (
                        <button
                          key={`${action.label}-${action.targetPage}-${action.targetExam ?? ''}`}
                          type="button"
                          className="button secondary compact-btn"
                          onClick={() => onExecuteAction?.(action)}
                        >
                          {action.label}
                          <ArrowUpRight size={14} />
                        </button>
                      ))}
                    </div>
                  )}
                  {stream.complete && (
                    <a className="text-link" href="#missions">
                      See Countermeasures
                      <ArrowUpRight size={15} />
                    </a>
                  )}
                </div>
              )}
            </>
          )
        )}
      </div>
    </article>
  );
}

export function AIPage({
  context,
  offline,
  gateway = false,
  recordsLoading = false,
  recordsError = '',
  initialQuestion = '',
  onClearInitialQuestion,
  onOpenSelfExam,
  onNavigate,
}: {
  context: AssistantContext;
  offline: boolean;
  gateway?: boolean;
  recordsLoading?: boolean;
  recordsError?: string;
  initialQuestion?: string;
  onClearInitialQuestion?: () => void;
  onOpenSelfExam?: (exam: SelfExamType) => void;
  onNavigate?: (page: Page) => void;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    return conversationCache.get(context.astronautId) ?? [];
  });

  useEffect(() => {
    conversationCache.set(context.astronautId, messages);
  }, [context.astronautId, messages]);

  useEffect(() => {
    setMessages(conversationCache.get(context.astronautId) ?? []);
  }, [context.astronautId]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [speechSupported, setSpeechSupported] = useState(false);
  const [ttsSupported, setTtsSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [interimVoice, setInterimVoice] = useState('');
  const [autoRead, setAutoRead] = useState(true);
  const [speakingId, setSpeakingId] = useState<string | null>(null);
  const [streamState, setStreamState] = useState<{
    id: string;
    revealedChars: number;
    totalChars: number;
    waitingForTts: boolean;
  } | null>(null);

  const bottom = useRef<HTMLDivElement>(null);
  const request = useRef(0);
  const liveContext = useRef(context);
  const unavailable = offline || recordsLoading || !!recordsError;
  const unavailableRef = useRef(unavailable);
  const inputRef = useRef(input);
  const loadingRef = useRef(loading);
  const dictationRef = useRef<{ stop: () => void } | null>(null);
  const prevAstronautRef = useRef(context.astronautId);
  const streamTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const streamTargetRef = useRef<{
    id: string;
    weights: number[];
    totalChars: number;
    targetChars: number;
    revealedChars: number;
    waitingForTts: boolean;
    audioDriven: boolean;
    startedAtMs: number;
    fallbackDurationMs: number;
  } | null>(null);

  liveContext.current = context;
  unavailableRef.current = unavailable;
  inputRef.current = input;
  loadingRef.current = loading;

  function stopStreamTimer() {
    if (streamTimerRef.current !== null) {
      clearInterval(streamTimerRef.current);
      streamTimerRef.current = null;
    }
  }

  function finishStreaming() {
    stopStreamTimer();
    streamTargetRef.current = null;
    setStreamState(null);
  }

  function startStreamTimer() {
    stopStreamTimer();
    streamTimerRef.current = setInterval(() => {
      const cur = streamTargetRef.current;
      if (!cur) {
        stopStreamTimer();
        return;
      }
      if (cur.waitingForTts) return;

      if (!cur.audioDriven) {
        const elapsed = Math.max(0, performance.now() - cur.startedAtMs);
        const ratio = Math.min(1, elapsed / cur.fallbackDurationMs);
        cur.targetChars = Math.max(cur.targetChars, charCountForStreamRatio(cur.weights, ratio));
      }

      if (cur.revealedChars < cur.targetChars) {
        const deficit = cur.targetChars - cur.revealedChars;
        const step = deficit > 8 ? Math.ceil(deficit / 4) : 1;
        cur.revealedChars = Math.min(cur.totalChars, cur.revealedChars + step);
        setStreamState({
          id: cur.id,
          revealedChars: cur.revealedChars,
          totalChars: cur.totalChars,
          waitingForTts: false,
        });
      }

      if (cur.revealedChars >= cur.totalChars && cur.targetChars >= cur.totalChars) {
        finishStreaming();
      }
    }, 24);
  }

  useEffect(() => {
    setSpeechSupported(isVoiceDictationSupported());
    setTtsSupported(isTtsPlaybackSupported());
    if (isSpeechSynthesisSupported()) preloadSpeechVoices();
    return () => {
      request.current++;
      dictationRef.current?.stop();
      stopSpeaking();
      finishStreaming();
    };
  }, []);

  useEffect(() => {
    if (prevAstronautRef.current !== context.astronautId) {
      prevAstronautRef.current = context.astronautId;
      request.current++;
      dictationRef.current?.stop();
      stopSpeaking();
      finishStreaming();
      setMessages([]);
      setSpeakingId(null);
      setListening(false);
      setTranscribing(false);
      setInterimVoice('');
      setError('');
    }
  }, [context.astronautId]);

  useEffect(() => {
    if (initialQuestion) {
      setInput(initialQuestion);
      onClearInitialQuestion?.();
    }
  }, [initialQuestion, onClearInitialQuestion]);

  useEffect(() => {
    if (messages.length) bottom.current?.scrollIntoView({ behavior: 'auto', block: 'nearest' });
  }, [messages, loading, streamState?.revealedChars, streamState?.waitingForTts]);

  function speakMessage(id: string, reply: AssistantReply) {
    if (speakingId === id) {
      stopSpeaking();
      setSpeakingId(null);
      finishStreaming();
      return;
    }
    finishStreaming();
    primeAudioPlayback();
    setError('');
    const started = speakAssistantReply(buildSpokenSummary(reply), {
      preferServerAudio: true,
      onStart: () => setSpeakingId(id),
      onEnd: () => setSpeakingId(current => (current === id ? null : current)),
      onError: message => {
        setSpeakingId(current => (current === id ? null : current));
        if (message) setError(message);
      },
    });
    if (started) setSpeakingId(id);
    else setError('Text-to-speech has no playable text for this reply.');
  }

  function startSyncedReply(replyId: string, reply: AssistantReply) {
    const weights = computeDisplayCharWeights(reply);
    const totalChars = weights.length;
    if (totalChars === 0) return;

    const totalWeight = weights[totalChars - 1] || totalChars;
    const syncWithTts = autoRead && ttsSupported;
    streamTargetRef.current = {
      id: replyId,
      weights,
      totalChars,
      targetChars: 0,
      revealedChars: 0,
      waitingForTts: syncWithTts,
      audioDriven: false,
      startedAtMs: syncWithTts ? 0 : performance.now(),
      fallbackDurationMs: Math.max(600, Math.round(totalWeight * (syncWithTts ? 56 : 18))),
    };
    setStreamState({
      id: replyId,
      revealedChars: 0,
      totalChars,
      waitingForTts: syncWithTts,
    });
    startStreamTimer();

    if (!syncWithTts) return;

    const beginFallbackTiming = () => {
      const cur = streamTargetRef.current;
      if (!cur || cur.id !== replyId || !cur.waitingForTts) return;
      cur.waitingForTts = false;
      cur.audioDriven = false;
      cur.startedAtMs = performance.now();
      cur.fallbackDurationMs = Math.max(500, Math.round(totalWeight * 20));
      setStreamState(prev => (prev && prev.id === replyId ? { ...prev, waitingForTts: false } : prev));
    };

    setError('');
    const started = speakAssistantReply(buildSpokenSummary(reply), {
      preferServerAudio: true,
      onStart: meta => {
        setSpeakingId(replyId);
        const cur = streamTargetRef.current;
        if (!cur || cur.id !== replyId) return;
        cur.waitingForTts = false;
        cur.startedAtMs = performance.now();
        if (meta?.durationSec && meta.durationSec > 0) {
          cur.audioDriven = true;
        }
        setStreamState(prev => (prev && prev.id === replyId ? { ...prev, waitingForTts: false } : prev));
      },
      onProgress: progress => {
        const cur = streamTargetRef.current;
        if (!cur || cur.id !== replyId) return;
        if (progress.durationSec > 0) {
          cur.waitingForTts = false;
          cur.audioDriven = true;
          cur.targetChars = Math.max(cur.targetChars, charCountForStreamRatio(cur.weights, progress.ratio));
        }
      },
      onEnd: () => {
        setSpeakingId(current => (current === replyId ? null : current));
        const cur = streamTargetRef.current;
        if (!cur || cur.id !== replyId) return;
        cur.waitingForTts = false;
        cur.audioDriven = true;
        cur.targetChars = cur.totalChars;
      },
      onError: message => {
        setSpeakingId(current => (current === replyId ? null : current));
        if (message) setError(message);
        beginFallbackTiming();
      },
    });
    if (started) {
      setSpeakingId(replyId);
    } else {
      beginFallbackTiming();
    }
  }

  function handleAction(action: AssistantAction) {
    if (action.targetExam && onOpenSelfExam) {
      onOpenSelfExam(action.targetExam);
      return;
    }
    if (onNavigate) {
      onNavigate(action.targetPage);
    } else if (typeof window !== 'undefined') {
      window.location.hash = action.targetPage;
    }
  }

  function toggleVoiceInput() {
    if (listening) {
      dictationRef.current?.stop();
      dictationRef.current = null;
      setListening(false);
      setInterimVoice('');
      return;
    }
    if (transcribing) return;
    stopSpeaking();
    setSpeakingId(null);
    setError('');
    if (autoRead && ttsSupported) {
      // Synchronously unlock audio context on direct mic tap so model TTS reply can play automatically.
      primeAudioPlayback();
    }
    const handle = startVoiceDictation({
      onInterim: text => setInterimVoice(text),
      onFinal: text => {
        const fullPrompt = (inputRef.current.trim() ? `${inputRef.current.trim()} ${text}` : text).trim();
        setInterimVoice('');
        if (!fullPrompt) return;
        if (unavailableRef.current || loadingRef.current) {
          setInput(fullPrompt);
          return;
        }
        setInput('');
        void send(fullPrompt, 'chat');
      },
      onProcessing: busy => setTranscribing(busy),
      onError: message => {
        setError(message);
        setListening(false);
        setTranscribing(false);
        setInterimVoice('');
        dictationRef.current = null;
      },
      onEnd: () => {
        setListening(false);
        setTranscribing(false);
        setInterimVoice('');
        dictationRef.current = null;
      },
    });
    if (handle) {
      dictationRef.current = handle;
      setListening(true);
    }
  }

  async function send(question: string, mode: AssistantMode = 'chat') {
    const text = question.trim();
    if (!text || loading || unavailable) return;
    if (autoRead && ttsSupported) {
      // Unlock audio element synchronously inside user click/submit for Safari and mobile Auto-read.
      primeAudioPlayback();
    }
    if (listening) {
      dictationRef.current?.stop();
      dictationRef.current = null;
      setListening(false);
      setInterimVoice('');
    }
    const token = ++request.current;
    finishStreaming();
    stopSpeaking();
    setSpeakingId(null);
    const history = messages
      .slice(-6)
      .map(m => ({
        role: m.role,
        content: m.role === 'user' ? (m.text ?? '') : [m.reply?.facts, m.reply?.action].filter(Boolean).join(' '),
      }))
      .filter(turn => turn.content.trim().length > 0);

    setMessages(items => [...items, { id: crypto.randomUUID(), role: 'user', text }]);
    setInput('');
    setLoading(true);
    setError('');
    try {
      if (unavailableRef.current) {
        throw new Error('Saved context is not available right now. Please retry after it loads or reconnects.');
      }
      const reply = await flightAssistant.ask(text, liveContext.current, { history, mode });
      if (token === request.current) {
        const replyId = crypto.randomUUID();
        setMessages(items => [...items, { id: replyId, role: 'assistant', reply }]);
        startSyncedReply(replyId, reply);
      }
    } catch (cause) {
      if (token === request.current) {
        setError(cause instanceof Error ? cause.message : 'Could not respond. Please try again.');
        setInput(text);
      }
    } finally {
      if (token === request.current) setLoading(false);
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    void send(input, 'chat');
  }

  return (
    <div className="assistant-page">
      <PageHeading
        eyebrow="FLIGHT SURGEON ASSISTANT"
        title="AI Health Assistant"
        description="Ask multi-turn clinical questions, run a Pre-EVA readiness brief, or generate a ground downlink SBAR."
      />
      <div className="assistant-layout assistant-focused">
        <section className="panel chat-panel">
          <div className="chat-header">
            <span className="section-icon">
              <Sparkles size={20} />
            </span>
            <div>
              <h2>Medical Consultation</h2>
              <p>
                {offline
                  ? 'Offline · assistant unavailable'
                  : gateway
                    ? 'Grounded in live telemetry, 7-day trends & NASA OSDR baselines'
                    : 'Onboard clinical rules · connect API key for Gemini'}
              </p>
            </div>
            {ttsSupported && (
              <button
                type="button"
                className="button secondary compact-btn"
                aria-pressed={autoRead}
                onClick={() => {
                  const next = !autoRead;
                  setAutoRead(next);
                  if (next) {
                    preloadSpeechVoices();
                    primeAudioPlayback();
                  } else {
                    stopSpeaking();
                    setSpeakingId(null);
                    finishStreaming();
                  }
                }}
              >
                {autoRead ? <Volume2 size={14} /> : <VolumeX size={14} />}
                Auto-read {autoRead ? 'on' : 'off'}
              </button>
            )}
            <span className={`status-dot ${offline ? 'offline-dot' : ''}`} />
          </div>

          <div className="ai-command-bar" aria-label="Quick clinical workflows">
            <button
              type="button"
              className="button secondary compact-btn"
              disabled={unavailable || loading}
              onClick={() => void send('Generate Pre-EVA Readiness Brief for this shift.', 'pre_eva_brief')}
            >
              Pre-EVA Readiness Brief
            </button>
            <button
              type="button"
              className="button secondary compact-btn"
              disabled={unavailable || loading}
              onClick={() => void send('Summarize my 7-day sleep, fatigue, stress, and hydration trends.', 'chat')}
            >
              7-Day Trend Check
            </button>
            <button
              type="button"
              className="button secondary compact-btn"
              disabled={unavailable || loading}
              onClick={() => void send('Generate Ground Downlink SBAR summary for Flight Surgeon review.', 'sbar_downlink')}
            >
              Generate Ground SBAR
            </button>
          </div>

          {offline && (
            <p className="warning-box" role="status">
              <WifiOff size={18} />
              You’re offline. Assistant is unavailable. Your saved check-ins, trends and countermeasures are still here.
            </p>
          )}
          {recordsLoading && (
            <p className="helper" role="status">
              Loading saved records and countermeasures for the selected astronaut…
            </p>
          )}
          {recordsError && (
            <p className="error-box" role="alert">
              Saved context could not be loaded. Use Retry local records above before asking a question.
            </p>
          )}

          <div className="chat-scroll" role="log" aria-live="polite" aria-label="Assistant conversation">
            {!messages.length && (
              <div className="chat-welcome">
                <h2>What would you like to review?</h2>
                <div className="suggested-questions">
                  {questions.map(question => (
                    <button key={question} disabled={unavailable || loading} onClick={() => void send(question, 'chat')}>
                      {question}
                      <ArrowUpRight size={17} />
                    </button>
                  ))}
                </div>
              </div>
            )}
            {messages.map(message => {
              const isStreamingThis = streamState?.id === message.id;
              return (
                <AIMessage
                  key={message.id}
                  message={message}
                  ttsSupported={ttsSupported}
                  isSpeaking={speakingId === message.id}
                  streamedChars={isStreamingThis ? streamState.revealedChars : undefined}
                  waitingForTts={isStreamingThis ? streamState.waitingForTts : false}
                  onToggleSpeak={
                    message.reply ? () => speakMessage(message.id, message.reply!) : undefined
                  }
                  onExecuteAction={handleAction}
                />
              );
            })}
            {loading && (
              <p className="thinking" role="status">
                <Sparkles size={16} />
                Reviewing telemetry, 7-day check-ins, and protocols…
              </p>
            )}
            <div ref={bottom} />
          </div>

          {error && (
            <p className="error-box" role="alert">
              {error}
            </p>
          )}
          {listening && (
            <p className="helper" role="status" aria-live="polite">
              Listening via microphone… {interimVoice || 'Speak your question clearly.'}
            </p>
          )}
          {!listening && transcribing && (
            <p className="helper" role="status" aria-live="polite">
              Transcribing audio…
            </p>
          )}

          <form onSubmit={submit} className="chat-composer">
            <label className="sr-only" htmlFor="ai-input">
              Ask the AI Health Assistant
            </label>
            <textarea
              id="ai-input"
              rows={1}
              value={input}
              maxLength={1000}
              onChange={e => setInput(e.target.value)}
              placeholder={offline ? 'Reconnect to ask a question…' : 'Type or dictate your clinical question…'}
              disabled={unavailable}
            />
            <button
              type="button"
              className={`button secondary voice-mic-btn ${listening ? 'listening' : ''}`}
              onClick={toggleVoiceInput}
              disabled={unavailable || loading || transcribing || !speechSupported}
              aria-pressed={listening}
              aria-label={
                transcribing
                  ? 'Transcribing recorded audio'
                  : listening
                    ? 'Stop voice dictation'
                    : speechSupported
                      ? 'Start voice dictation'
                      : 'Voice dictation unsupported in this browser'
              }
              title={
                transcribing
                  ? 'Transcribing audio…'
                  : speechSupported
                    ? listening
                      ? 'Stop voice dictation'
                      : 'Dictate question with microphone'
                    : 'Voice dictation is unavailable in this browser'
              }
            >
              {listening ? <MicOff size={18} /> : <Mic size={18} />}
            </button>
            <button
              type="submit"
              className="button primary"
              aria-label="Send message"
              disabled={unavailable || loading || !input.trim()}
            >
              <ArrowUp size={20} />
            </button>
          </form>
          <p className="chat-disclaimer">
            Grounded in saved telemetry and NASA OSDR baselines. Does not replace your mission Flight Surgeon.
          </p>
        </section>
      </div>
      <section className="panel compact-note">
        <p className="helper">
          <strong>Privacy &amp; grounding:</strong> This assistant reads records saved on this device, self-exam severities, and live numeric telemetry. Symptoms, discomfort notes, pain locations, and personal reflections are excluded from assistant context.
        </p>
      </section>
    </div>
  );
}


