"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Ambient, Bloom } from "./Bloom";
import { CarGallery } from "./CarGallery";
import { ComparisonCard } from "./ComparisonCard";
import { DemoPicker, useDemoData } from "./DemoPicker";
import { Icon, type IconName } from "./Icon";
import { Mascot, type MascotMood } from "./Mascot";
import { AttachButton, PayslipCard, PayslipDropzone, usePayslip } from "./Payslip";
import { RankingCard } from "./RankingCard";
import { QUICK_ASKS, Sidebar } from "./Sidebar";
import type { ChatView, Profile, TranscriptEntry } from "./types";

const SESSION_KEY = "strauss-car-advisor-session";
const POLL_MS = 4000;

const FEATURES: { icon: IconName; text: string }[] = [
  { icon: "target", text: "חישוב מדויק לשקל" },
  { icon: "doc", text: "קריאת תלוש שכר" },
  { icon: "car", text: "תמונות של כל הרכבים" },
  { icon: "person", text: "שאלה לנציג כשצריך" },
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
  const last = entry.comparisons?.at(-1)?.result.diffNet ?? entry.rankings?.at(-1)?.result.options[0]?.diffNet;
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
  const [menuOpen, setMenuOpen] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const payslip = usePayslip();
  const demo = useDemoData();

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
  }, [transcript.length, sending, payslip.slip.phase]);

  /** שליחת הודעה לבוט. אפשר לתת מזהה שיחה, כשהיא נפתחה הרגע ועוד לא הגיעה ל-state. */
  async function send(text: string, session: string | null = sessionId) {
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
        body: JSON.stringify({ sessionId: session, message }),
      });
      const data = (await res.json()) as ChatView & { error?: string };
      if (!res.ok) {
        setError(data.error ?? "משהו השתבש. נסו שוב.");
        if (session) await load(session);
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
    payslip.reset();
  }

  /** כרטיסי ההשוואה והדירוג של הודעה אחת. כשהדירוג כבר מוצג, אין צורך בכפתור שפותח אותו. */
  const cards = (entry: TranscriptEntry) => (
    <>
      {entry.comparisons?.map((c, j) => (
        <ComparisonCard
          key={`c${j}`}
          data={c.result}
          input={c.input}
          reference={c.reference}
          showRank={!entry.rankings?.length}
          sessionId={sessionId}
          onView={applyView}
        />
      ))}
      {entry.rankings?.map((r, j) => (
        <RankingCard key={`r${j}`} data={r.result} input={r.input} sessionId={sessionId} onView={applyView} />
      ))}
    </>
  );

  /** פעולה מהתפריט: בטלפון התפריט נסגר, והשיחה ממשיכה */
  function fromMenu(action: () => void) {
    setMenuOpen(false);
    action();
  }

  function showDemo() {
    newChat();
    setTimeout(() => document.getElementById("demo")?.scrollIntoView({ behavior: "smooth", block: "start" }), 80);
  }

  return (
    <>
      <Ambient />
      <div className="shell">
        <Sidebar
          open={menuOpen}
          busy={sending}
          sessionId={sessionId}
          profile={profile}
          proof={demo?.verified ?? null}
          onClose={() => setMenuOpen(false)}
          onNewChat={() => fromMenu(newChat)}
          onAsk={(text) => fromMenu(() => void send(text))}
          onUpload={(f) => fromMenu(() => void payslip.readFile(f))}
          onDemo={() => fromMenu(showDemo)}
          onView={applyView}
        />

        <div className="main">
          <header className="mobilebar">
            <button type="button" className="icon-button" onClick={() => setMenuOpen(true)} aria-label="פתיחת התפריט">
              <Icon name="menu" />
            </button>
            <div className="mobilebar-brand">
              <Bloom size={30} variant={sending ? "thinking" : "mark"} />
              <span>
                יועץ הרכב של <b>שטראוס</b>
              </span>
            </div>
            <button type="button" className="icon-button" onClick={newChat} aria-label="שיחה חדשה">
              <Icon name="plus" />
            </button>
          </header>

          <main className="stream">
            <div className="messages" aria-live="polite">
              {transcript.length === 0 && (
                <section className="welcome">
                  <div className="welcome-text">
                    <span className="eyebrow">
                      <Bloom size={18} variant="mark" />
                      יועץ הרכב של שטראוס
                    </span>
                    <h2>
                      מה יקרה ל<em>נטו</em> שלך?
                    </h2>
                    <p>
                      ספרו לי איזה רכב יש לכם ומה אתם שוקלים: רכב אחר, רכב חשמלי או ויתור על הרכב. אחשב בדיוק כמה
                      הנטו ישתנה, לפי כללי החברה ונתוני רשות המסים. אם יחסר לי משהו שרק החברה יודעת, אשאל את הנציג.
                    </p>
                    <ul className="features">
                      {FEATURES.map((f) => (
                        <li key={f.text}>
                          <Icon name={f.icon} size={17} /> {f.text}
                        </li>
                      ))}
                    </ul>
                    <div className="suggestions">
                      {QUICK_ASKS.map((s) => (
                        <button key={s.text} type="button" className="suggestion" onClick={() => send(s.text)}>
                          <span className="suggestion-icon">
                            <Icon name={s.icon} />
                          </span>
                          <span>{s.text}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="welcome-art">
                    <div className="welcome-glow" aria-hidden="true" />
                    <Bloom size={340} variant="hero" />
                    <div className="hero-car">
                      <Mascot mood="happy" size={136} title="נטו, יועץ הרכב" />
                    </div>
                    <div className="speech">היי! אני נטו</div>
                  </div>
                </section>
              )}
              {transcript.length === 0 && payslip.slip.phase === "idle" && (
                <>
                  <PayslipDropzone onFile={payslip.readFile} onSample={payslip.readSample} />
                  <DemoPicker data={demo} onView={applyView} />
                </>
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
                        {cards(entry)}
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
                      {cards(entry)}
                    </div>
                  </div>
                );
              })}

              <PayslipCard
                slip={payslip.slip}
                sessionId={sessionId}
                onView={applyView}
                onSaved={(v) => void send("העליתי את תלוש השכר שלי. מה עוד צריך כדי לחשב?", v.sessionId)}
                onDone={payslip.reset}
                onSample={payslip.readSample}
              />

              {sending && (
                <div className="bot-row">
                  <div className="avatar">
                    <Mascot mood="thinking" size={42} />
                  </div>
                  <div className="typing-bubble">
                    <Bloom size={26} variant="thinking" />
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
            <AttachButton onFile={payslip.readFile} disabled={sending || payslip.slip.phase === "reading"} />
            <button type="submit" className="send-button" disabled={sending || !input.trim()} aria-label="שליחה">
              <SendIcon />
            </button>
          </form>
        </div>
      </div>
    </>
  );
}
