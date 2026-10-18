"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { CarGallery } from "./CarGallery";
import { ComparisonCard } from "./ComparisonCard";
import { Mascot, type MascotMood } from "./Mascot";
import { ProfilePanel } from "./ProfilePanel";
import type { ChatView, ComparisonRecord, Profile, TranscriptEntry } from "./types";

const SESSION_KEY = "strauss-car-advisor-session";
const POLL_MS = 4000;

const SUGGESTIONS = [
  { icon: "⚡", text: "אני שוקל/ת לעבור לרכב חשמלי. כמה זה ישנה לי בנטו?" },
  { icon: "🔑", text: "אני רוצה לוותר על הרכב ולקבל אחזקה. כמה אקבל?" },
  { icon: "👨‍👩‍👧‍👦", text: "יש לי 5 ילדים. אפשר לקבל רכב משפחתי?" },
];

const FEATURES = [
  { icon: "🎯", text: "חישוב מדויק לשקל" },
  { icon: "🚗", text: "תמונות של כל הרכבים" },
  { icon: "🙋", text: "שאלה לנציג כשצריך" },
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

/** מציג **הדגשה** מהבוט כטקסט מודגש, ושורות שמתחילות ב-* או ב-- כנקודות. בלי להריץ HTML. */
function renderText(text: string): ReactNode[] {
  const bulleted = text.replace(/^(\s*)[*-]\s+/gm, "$1• ");
  return bulleted.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith("**") && part.endsWith("**") ? <strong key={i}>{part.slice(2, -2)}</strong> : part,
  );
}

/** מצב הרוח של נטו ליד כל תשובה: שמח כשהנטו עולה, מודאג כשהוא יורד */
function moodFor(entry: TranscriptEntry): MascotMood {
  const last = entry.comparisons?.at(-1)?.result.diffNet;
  if (typeof last === "number" && last > 0) return "happy";
  if (typeof last === "number" && last < 0) return "sad";
  return "idle";
}

/** מטוס נייר שפונה שמאלה, לכיוון השליחה בעברית */
function SendIcon() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
      <path d="M21 12 3 4l4.5 16 5-6.5L21 12Z" fill="currentColor" />
    </svg>
  );
}

export default function ChatPage() {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
  const [openQuestions, setOpenQuestions] = useState<ChatView["openQuestions"]>([]);
  const [profile, setProfile] = useState<Profile>({});
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  const applyView = useCallback((v: ChatView) => {
    setSessionId(v.sessionId);
    setTranscript(v.transcript);
    setOpenQuestions(v.openQuestions);
    setProfile(v.profile ?? {});
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
    setProfile({});
    setError(null);
  }

  const cards = (records: ComparisonRecord[] | undefined) =>
    records?.map((c, j) => (
      <ComparisonCard key={j} data={c.result} input={c.input} sessionId={sessionId} onView={applyView} />
    ));

  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar-inner">
          <div className="brand">
            <Mascot mood={sending ? "thinking" : "idle"} size={54} />
            <div>
              <h1>יועץ הרכב של שטראוס</h1>
              <p>אני נטו, ואני אגיד לך בדיוק מה יקרה לנטו שלך</p>
            </div>
          </div>
          {transcript.length > 0 && (
            <button type="button" className="ghost-button" onClick={newChat}>
              שיחה חדשה
            </button>
          )}
        </div>
      </header>

      <main className="page">
        {sessionId && Object.keys(profile).length > 0 && (
          <ProfilePanel sessionId={sessionId} profile={profile} onView={applyView} />
        )}

        <div className="messages" aria-live="polite">
          {transcript.length === 0 && (
            <section className="hero">
              <div className="hero-art">
                <Mascot mood="happy" size={170} title="נטו, יועץ הרכב" />
              </div>
              <div className="hero-text">
                <div className="speech">היי! אני נטו 👋</div>
                <h2>מה יקרה לנטו שלך?</h2>
                <p>
                  ספרו לי איזה רכב יש לכם ומה אתם שוקלים: רכב אחר, רכב חשמלי או ויתור על הרכב. אחשב בדיוק כמה הנטו
                  ישתנה, לפי כללי החברה ונתוני רשות המסים. אם יחסר לי משהו שרק החברה יודעת, אשאל את הנציג.
                </p>
                <div className="features">
                  {FEATURES.map((f) => (
                    <span key={f.text} className="feature">
                      <span aria-hidden="true">{f.icon}</span> {f.text}
                    </span>
                  ))}
                </div>
                <div className="suggestions">
                  {SUGGESTIONS.map((s) => (
                    <button key={s.text} type="button" className="suggestion" onClick={() => send(s.text)}>
                      <span className="suggestion-icon" aria-hidden="true">
                        {s.icon}
                      </span>
                      {s.text}
                    </button>
                  ))}
                </div>
              </div>
            </section>
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
            if (entry.role === "calc") {
              return (
                <div key={i} className="bot-row">
                  <div className="avatar">
                    <Mascot mood={moodFor(entry)} size={42} />
                  </div>
                  <div className="bot-content">
                    <div className="notice inline">{entry.text}</div>
                    {cards(entry.comparisons)}
                  </div>
                </div>
              );
            }
            return (
              <div key={i} className="bot-row">
                <div className="avatar">
                  <Mascot mood={moodFor(entry)} size={42} />
                </div>
                <div className="bot-content">
                  <div className="bubble bot">{renderText(entry.text)}</div>
                  {entry.via && entry.via.length > 0 && (
                    <div className="via">
                      {entry.via.length === 1 ? "ענה" : "ענו"}: {entry.via.join(", ")}
                    </div>
                  )}
                  {entry.cars?.map((g, j) => <CarGallery key={j} group={g} />)}
                  {cards(entry.comparisons)}
                </div>
              </div>
            );
          })}

          {sending && (
            <div className="bot-row">
              <div className="avatar">
                <Mascot mood="thinking" size={42} />
              </div>
              <div className="typing-bubble">
                <span className="dots" aria-hidden="true">
                  <i />
                  <i />
                  <i />
                </span>
                נטו בודק ומחשב...
              </div>
            </div>
          )}

          {openQuestions.length > 0 && !sending && (
            <div className="waiting">
              <Mascot mood="waiting" size={52} />
              <div>
                <strong>ממתין לתשובת הנציג</strong>
                <div>{openQuestions.map((q) => q.about).join(", ")}. השיחה תתעדכן כאן לבד כשהתשובה תגיע.</div>
              </div>
            </div>
          )}

          {error && (
            <div className="error-box" role="alert">
              <Mascot mood="sad" size={46} />
              <div>{error}</div>
            </div>
          )}
          <div ref={endRef} />
        </div>

        <footer className="footer">
          תמונות הרכבים מוויקישיתוף, ברישיונות Creative Commons, עם קרדיט לצלמים. הנתונים לדוגמה בלבד.
        </footer>
      </main>

      <form
        className="composer"
        onSubmit={(e) => {
          e.preventDefault();
          void send(input);
        }}
      >
        <textarea
          aria-label="הודעה לנטו"
          rows={1}
          value={input}
          placeholder="כתבו לנטו..."
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send(input);
            }
          }}
        />
        <button type="submit" className="send-button" disabled={sending || !input.trim()} aria-label="שליחה">
          <SendIcon />
        </button>
      </form>
    </div>
  );
}
