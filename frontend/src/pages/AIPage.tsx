import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowUp, ArrowUpRight, Sparkles, WifiOff, User } from 'lucide-react';
import { demoAssistant, type AssistantContext } from '../services/ai';
import type { AssistantReply } from '../types/wellness';
import { PageHeading } from '../components/AppShell';
import { Disclosure } from '../components/WellnessUI';

interface ChatMessage { id: string; role: 'user' | 'assistant'; text?: string; reply?: AssistantReply }
const questions = ['How have I been feeling recently?', 'What does my sleep history show?', 'What activities can I complete today?'];
export function AIMessage({ message }: { message: ChatMessage }) {
  return <article className={`chat-message ${message.role}`}><span className="message-avatar">{message.role === 'assistant' ? <Sparkles size={18} /> : <User size={18} />}</span><div><span className="message-author">{message.role === 'assistant' ? 'AI Health Assistant · demo' : 'You'}</span>{message.text && <p>{message.text}</p>}{message.reply && <><div className="reply-section"><strong>From your records</strong><p>{message.reply.facts}</p></div><div className="reply-section"><strong>What this means</strong><p>{message.reply.explanation}</p></div><div className="reply-section"><strong>What you can do next</strong><p>{message.reply.action}</p><a className="text-link" href="#missions">See Daily Activities<ArrowUpRight size={15} /></a></div></>}</div></article>;
}
export function AIPage({ context, offline, recordsLoading = false, recordsError = '' }: { context: AssistantContext; offline: boolean; recordsLoading?: boolean; recordsError?: string }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const bottom = useRef<HTMLDivElement>(null);
  const request = useRef(0);
  const liveContext = useRef(context);
  const unavailable = offline || recordsLoading || !!recordsError;
  const unavailableRef = useRef(unavailable);
  liveContext.current = context; unavailableRef.current = unavailable;
  useEffect(() => () => { request.current++; }, []);
  useEffect(() => { if (messages.length) bottom.current?.scrollIntoView({ behavior: 'auto', block: 'nearest' }); }, [messages, loading]);
  async function send(question: string) {
    const text = question.trim(); if (!text || loading || unavailable) return;
    const token = ++request.current;
    setMessages(items => [...items, { id: crypto.randomUUID(), role: 'user', text }]); setInput(''); setLoading(true); setError('');
    try {
      await new Promise(resolve => window.setTimeout(resolve, 400));
      if (unavailableRef.current) throw new Error('Saved context is not available right now. Please retry after it loads or reconnects.');
      const reply = await demoAssistant.ask(text, liveContext.current);
      if (token === request.current) setMessages(items => [...items, { id: crypto.randomUUID(), role: 'assistant', reply }]);
    } catch (cause) { if (token === request.current) { setError(cause instanceof Error ? cause.message : 'Could not respond. Please try again.'); setInput(text); } }
    finally { if (token === request.current) setLoading(false); }
  }
  function submit(event: FormEvent) { event.preventDefault(); void send(input); }
  return <><PageHeading eyebrow="HERE TO HELP" title="AI Health Assistant" description="Ask questions about your recorded health trends and available wellness activities." action={<span className="pill">Demo mode</span>} />
    <div className="assistant-layout assistant-focused"><section className="panel chat-panel"><div className="chat-header"><span className="section-icon"><Sparkles size={20} /></span><div><h2>Your conversation</h2><p>{offline ? 'Offline · assistant unavailable' : 'Demo responses · Gemini is not connected'}</p></div><span className={`status-dot ${offline ? 'offline-dot' : ''}`} /></div>
      {offline && <p className="warning-box" role="status"><WifiOff size={18} />You’re offline. Gemini is unavailable. Your saved check-ins, trends and activities are still here.</p>}
      {recordsLoading && <p className="helper" role="status">Loading saved records and activities for the selected astronaut…</p>}{recordsError && <p className="error-box" role="alert">Saved context could not be loaded. Use Retry local records above before asking a question.</p>}
      <div className="chat-scroll" role="log" aria-live="polite" aria-label="Assistant conversation">
        {!messages.length && <div className="chat-welcome"><h2>What would you like to know?</h2><div className="suggested-questions">{questions.map(question => <button key={question} disabled={unavailable || loading} onClick={() => void send(question)}>{question}<ArrowUpRight size={17} /></button>)}</div></div>}
        {messages.map(message => <AIMessage key={message.id} message={message} />)}{loading && <p className="thinking" role="status"><Sparkles size={16} />Looking at your saved records…</p>}<div ref={bottom} />
      </div>
      {error && <p className="error-box" role="alert">{error}</p>}
      <form onSubmit={submit} className="chat-composer"><label className="sr-only" htmlFor="ai-input">Ask the AI Health Assistant</label><textarea id="ai-input" rows={2} value={input} maxLength={1000} onChange={e => setInput(e.target.value)} placeholder={offline ? 'Reconnect to ask a question…' : 'Type your question…'} disabled={unavailable} /><button type="submit" className="button primary" aria-label="Send message" disabled={unavailable || loading || !input.trim()}><ArrowUp size={20} /></button></form><p className="chat-disclaimer">This demo explains saved records. It does not replace your mission medical team.</p>
    </section></div><Disclosure title="About this demo and your privacy"><p>This demo reads records saved on this device. No messages are sent to Gemini. Symptoms, discomfort notes, pain locations and personal reflections are excluded from assistant context. Responses separate recorded facts, explanations and suggested next steps.</p><p className="helper">Gemini is not connected and is unavailable offline. A future connection will go through the application server.</p></Disclosure>
  </>;
}


