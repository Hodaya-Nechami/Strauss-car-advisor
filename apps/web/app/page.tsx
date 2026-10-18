"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { ComparisonCard, type ComparisonView } from "./ComparisonCard";

interface TranscriptEntry {
  role: "employee" | "bot" | "notice";
  text: string;
  comparisons?: { input: unknown; result: ComparisonView }[];
  at: string;
}

interface ChatView {
  sessionId: string | null;
  transcript: TranscriptEntry[];
  openQuestions: { ticketId: string; about: string; question: string }[];
}

const SESSION_KEY = "strauss-car-advisor-session";
const POLL_MS = 4000;

const SUGGESTIONS = [
  "אני שוקל/ת לעבור לרכב חשמלי. כמה זה ישנה לי בנטו?",
  "אני רוצה לוותר על הרכב ולקבל אחזקה. כמה אקבל?",
  "יש לי 5 ילדים. אפשר לקבל רכב משפחתי?",
];

function readSessionId(): string | null {
  try {
    return localStorage.getItem(SESSION_KEY);
  } catch {
    return null;
  }
}

function writeSessionId(id: string | null) {
  try {
    if (id) localStorage.setItem(SESSION_KEY, id);
    else localStorage.removeItem(SESSION_KEY);
  } catch {
    // בלי אחסון מקומי השיחה פשוט לא תשרוד רענון
  }
}

/** מציג **הדגשה** מהבוט כטקסט מודגש, בלי להריץ HTML */
function renderText(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith("**") && part.endsWith("**") ? <strong key={i}>{part.slice(2, -2)}</strong> : part,
  );
}

export default function ChatPage() {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
  const [openQuestions, setOpenQuestions] = useState<ChatView["openQuestions"]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  const applyView = useCallback((v: ChatView) => {
    setSessionId(v.sessionId);
    setTranscript(v.transcript);
    setOpenQuestions(v.openQuestions);
    writeSessionId(v.sessionId);
  }, []);

  const load = useCallback(
    async (id: string) => {
      const res = await fetch(`/api/chat?sessionId=${encodeURIComponent(id)}`, { cache: "no-store" });
      if (res.ok) applyView((await res.json()) as ChatView);
    },
    [applyView],
  );

  // טעינת השיחה הקודמת אחרי רענון
  useEffect(() => {
    const id = readSessionId();
    if (id) load(id).catch(() => undefined);
  }, [load]);

  // כשיש שאלה פתוחה לנציג, בודקים מדי כמה שניות אם הוא ענה
  useEffect(() => {
    if (!sessionId || openQuestions.length === 0 || sending) return;
    const timer = setInterval(() => load(sessionId).catch(() => undefined), POLL_MS);
    return () => clearInterval(timer);
  }, [sessionId, openQuestions.length, sending, load]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [transcript.length, sending]);

  async function send(text: string) {
    const message = text.trim();
    if (!message || sending) return;
    setSending(true);
    setError(null);
    setInput("");
    setTranscript((t) => [...t, { role: "employee", text: message, at: new Date().toISOString() }]);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, message }),
      });
      const data = (await res.json()) as ChatView & { error?: string };
      if (!res.ok) {
        setError(data.error ?? "משהו השתבש. נסו שוב.");
        if (sessionId) await load(sessionId);
        return;
      }
      applyView(data);
    } catch {
      setError("אין חיבור לשרת. בדקו שהוא רץ ונסו שוב.");
    } finally {
      setSending(false);
    }
  }

  function newChat() {
    writeSessionId(null);
    setSessionId(null);
    setTranscript([]);
    setOpenQuestions([]);
    setError(null);
  }

  return (
    <main className="page">
      <header className="header">
        <div>
          <h1>יועץ הרכב של שטראוס</h1>
          <p>מה יקרה לנטו שלי אם אחליף רכב, אעבור לחשמלי או אוותר על הרכב?</p>
        </div>
        {transcript.length > 0 && (
          <button type="button" className="ghost-button" onClick={newChat}>
            שיחה חדשה
          </button>
        )}
      </header>

      <div className="messages" aria-live="polite">
        {transcript.length === 0 && (
          <div className="welcome">
            <h2>שלום! איך אפשר לעזור?</h2>
            <p>
              אני מחשב/ת בדיוק כמה הנטו שלך ישתנה, לפי כללי החברה ונתוני שווי השימוש של רשות המסים. אם חסר לי נתון
              שרק החברה יודעת, אשאל את נציג התחבורה.
            </p>
            <div className="suggestions">
              {SUGGESTIONS.map((s) => (
                <button key={s} type="button" className="suggestion" onClick={() => send(s)}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {transcript.map((entry, i) => {
          if (entry.role === "employee") {
            return (
              <div key={i} className="bubble employee">
                {entry.text}
              </div>
            );
          }
          if (entry.role === "notice") {
            return (
              <div key={i} className="notice">
                {entry.text}
              </div>
            );
          }
          return (
            <div key={i} className="bot-block">
              <div className="bubble bot">{renderText(entry.text)}</div>
              {entry.comparisons?.map((c, j) => <ComparisonCard key={j} data={c.result} />)}
            </div>
          );
        })}

        {sending && <div className="typing">היועץ בודק ומחשב...</div>}

        {openQuestions.length > 0 && !sending && (
          <div className="waiting">
            ממתין לתשובת הנציג: {openQuestions.map((q) => q.about).join(", ")}. השיחה תתעדכן כאן אוטומטית.
          </div>
        )}

        {error && <div className="error">{error}</div>}
        <div ref={endRef} />
      </div>

      <form
        className="composer"
        onSubmit={(e) => {
          e.preventDefault();
          void send(input);
        }}
      >
        <label htmlFor="message" className="sr-only" hidden>
          הודעה ליועץ
        </label>
        <textarea
          id="message"
          rows={1}
          value={input}
          placeholder="כתבו כאן..."
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send(input);
            }
          }}
        />
        <button type="submit" className="send-button" disabled={sending || !input.trim()}>
          שליחה
        </button>
      </form>
    </main>
  );
}
