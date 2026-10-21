"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Icon } from "../Icon";

const PASSWORD_KEY = "strauss-rep-password";
const POLL_MS = 4000;

interface RepQuestionItem {
  sessionId: string;
  ticketId: string;
  about: string;
  question: string;
}

interface RepHistoryItem extends RepQuestionItem {
  answer: string;
  answeredAt: string;
}

function shortId(id: string): string {
  return id.slice(0, 8);
}

export default function RepPage() {
  const [password, setPassword] = useState<string | null>(null);
  const [passwordInput, setPasswordInput] = useState("");
  const [authError, setAuthError] = useState<string | null>(null);
  const [open, setOpen] = useState<RepQuestionItem[]>([]);
  const [history, setHistory] = useState<RepHistoryItem[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(PASSWORD_KEY);
      if (saved) setPassword(saved);
    } catch {
      // בלי אחסון מקומי צריך להתחבר כל פעם מחדש
    }
  }, []);

  const load = useCallback(async (pwd: string) => {
    const res = await fetch("/api/rep", { headers: { "x-rep-password": pwd }, cache: "no-store" });
    if (res.status === 401) {
      setAuthError("סיסמה שגויה");
      setPassword(null);
      try {
        localStorage.removeItem(PASSWORD_KEY);
      } catch {
        // אין מה לנקות
      }
      return;
    }
    if (!res.ok) {
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      setLoadError(data?.error ?? "שגיאה בטעינת הפניות");
      return;
    }
    setLoadError(null);
    const data = (await res.json()) as { open: RepQuestionItem[]; history: RepHistoryItem[] };
    setOpen(data.open);
    setHistory(data.history);
  }, []);

  // טעינה ראשונה ועדכון אוטומטי כל כמה שניות, כל עוד יש סיסמה
  useEffect(() => {
    if (!password) return;
    load(password).catch(() => setLoadError("אין חיבור לשרת"));
    const timer = setInterval(() => load(password).catch(() => undefined), POLL_MS);
    return () => clearInterval(timer);
  }, [password, load]);

  function login(e: FormEvent) {
    e.preventDefault();
    const pwd = passwordInput.trim();
    if (!pwd) return;
    setAuthError(null);
    setPasswordInput("");
    try {
      localStorage.setItem(PASSWORD_KEY, pwd);
    } catch {
      // בלי אחסון מקומי הסיסמה לא תשרוד רענון
    }
    setPassword(pwd);
  }

  function logout() {
    setPassword(null);
    try {
      localStorage.removeItem(PASSWORD_KEY);
    } catch {
      // אין מה לנקות
    }
  }

  async function answer(item: RepQuestionItem) {
    if (!password) return;
    const text = (drafts[item.ticketId] ?? "").trim();
    if (!text) return;
    setSendingId(item.ticketId);
    setLoadError(null);
    try {
      const res = await fetch("/api/rep", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-rep-password": password },
        body: JSON.stringify({ sessionId: item.sessionId, ticketId: item.ticketId, answer: text }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        setLoadError(data?.error ?? "שליחת התשובה נכשלה");
        return;
      }
      setDrafts((d) => {
        const next = { ...d };
        delete next[item.ticketId];
        return next;
      });
      await load(password);
    } catch {
      setLoadError("אין חיבור לשרת");
    } finally {
      setSendingId(null);
    }
  }

  if (!password) {
    return (
      <div className="rep-shell rep-center">
        <form className="card rep-login" onSubmit={login}>
          <div className="card-title">
            <span className="title-icon">
              <Icon name="lock" size={18} />
            </span>
            מסך הנציג
          </div>
          <p className="rep-hint">הכניסו את הסיסמה של הצוות כדי לראות פניות פתוחות ולענות לעובדים.</p>
          <input
            type="password"
            className="rep-input"
            placeholder="סיסמה"
            value={passwordInput}
            onChange={(e) => setPasswordInput(e.target.value)}
            autoFocus
          />
          <button type="submit" className="ghost-button rep-primary" disabled={!passwordInput.trim()}>
            כניסה
          </button>
          {authError && <div className="rep-error">{authError}</div>}
        </form>
      </div>
    );
  }

  return (
    <div className="rep-shell">
      <header className="rep-header">
        <div className="card-title">
          <span className="title-icon">
            <Icon name="person" size={18} />
          </span>
          מסך הנציג
        </div>
        <button type="button" className="ghost-button" onClick={logout}>
          <Icon name="close" size={14} /> התנתקות
        </button>
      </header>

      {loadError && <div className="rep-error">{loadError}</div>}

      <section className="card rep-section">
        <div className="card-head">
          <div className="card-title">
            <span className="title-icon small">
              <Icon name="chat" size={16} />
            </span>
            פניות פתוחות
          </div>
          <span className="badge">{open.length}</span>
        </div>
        {open.length === 0 ? (
          <p className="rep-empty">אין פניות פתוחות כרגע.</p>
        ) : (
          <ul className="rep-list">
            {open.map((q) => (
              <li key={q.ticketId} className="rep-item">
                <div className="rep-item-head">
                  <span className="badge">{q.about}</span>
                  <span className="rep-session">שיחה {shortId(q.sessionId)}</span>
                </div>
                <p className="rep-question">{q.question}</p>
                <div className="rep-answer-row">
                  <textarea
                    className="rep-textarea"
                    placeholder="כתבו תשובה..."
                    value={drafts[q.ticketId] ?? ""}
                    onChange={(e) => setDrafts((d) => ({ ...d, [q.ticketId]: e.target.value }))}
                    rows={2}
                  />
                  <button
                    type="button"
                    className="ghost-button rep-primary"
                    disabled={sendingId === q.ticketId || !(drafts[q.ticketId] ?? "").trim()}
                    onClick={() => answer(q)}
                  >
                    {sendingId === q.ticketId ? "שולח..." : "שלח תשובה"}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card rep-section">
        <div className="card-head">
          <div className="card-title">
            <span className="title-icon small">
              <Icon name="check" size={16} />
            </span>
            היסטוריה
          </div>
          <span className="badge">{history.length}</span>
        </div>
        {history.length === 0 ? (
          <p className="rep-empty">עדיין לא נענתה אף פנייה.</p>
        ) : (
          <ul className="rep-list">
            {history.map((a) => (
              <li key={a.ticketId} className="rep-item">
                <div className="rep-item-head">
                  <span className="badge">{a.about}</span>
                  <span className="rep-session">
                    <Icon name="clock" size={13} /> {new Date(a.answeredAt).toLocaleString("he-IL")}
                  </span>
                </div>
                <p className="rep-question">{a.question}</p>
                <p className="rep-answered">{a.answer}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
