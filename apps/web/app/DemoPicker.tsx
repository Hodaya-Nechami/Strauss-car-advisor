"use client";

/**
 * מצב הדגמה במסך הפתיחה: 6 העובדים לדוגמה מהקובץ של המארגנים.
 * לחיצה טוענת את הנתונים ומציגה מיד את החישוב, בלי להקליד ובלי לחכות למודל שפה.
 * התג למעלה מחושב עכשיו בשרת: כל עובד נבדק מול נטו הייחוס של המארגנים.
 */
import { useEffect, useState, type CSSProperties } from "react";
import { CarThumb } from "./CarImage";
import type { ChatView, Persona } from "./types";

interface DemoData {
  personas: Persona[];
  verified: { matched: number; total: number };
}

const initials = (name: string) =>
  name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2);

export function DemoPicker({ onView }: { onView: (v: ChatView) => void }) {
  const [data, setData] = useState<DemoData | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/demo", { cache: "no-store" })
      .then((res) => (res.ok ? (res.json() as Promise<DemoData>) : null))
      .then(setData)
      .catch(() => undefined);
  }, []);

  if (!data || data.personas.length === 0) return null;
  const { matched, total } = data.verified;

  async function start(id: string) {
    if (busy) return;
    setBusy(id);
    setError(null);
    try {
      const res = await fetch("/api/demo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ personaId: id }),
      });
      const view = (await res.json()) as ChatView & { error?: string };
      if (!res.ok) setError(view.error ?? "לא הצלחתי לטעון את העובד לדוגמה");
      else onView(view);
    } catch {
      setError("אין חיבור לשרת");
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="demo" aria-labelledby="demo-title">
      <div className="demo-head">
        <div>
          <h3 id="demo-title">🎬 רוצים לראות איך זה עובד?</h3>
          <p>בחרו עובד לדוגמה. הנתונים שלו נטענים, והחישוב מופיע מיד, בלי להקליד כלום.</p>
        </div>
        <span className={`proof${matched === total ? "" : " partial"}`}>
          <span className="proof-check" aria-hidden="true">
            {matched === total ? "✓" : "!"}
          </span>
          <span>
            נבדק עכשיו: <strong>{matched} מתוך {total}</strong> העובדים לדוגמה של המארגנים יוצאים זהים עד השקל
          </span>
        </span>
      </div>

      <div className="persona-grid">
        {data.personas.map((p, i) => (
          <button
            key={p.id}
            type="button"
            className={`persona${busy === p.id ? " loading" : ""}`}
            style={{ "--tone": i } as CSSProperties}
            onClick={() => void start(p.id)}
            disabled={busy !== null}
          >
            <span className="persona-top">
              <span className="persona-avatar" aria-hidden="true">
                {initials(p.name)}
              </span>
              <span className="persona-who">
                <span className="persona-name">{p.name}</span>
                <span className="persona-role">
                  {p.occupation} · קבוצה {p.group}
                </span>
              </span>
            </span>
            <span className="persona-swap" aria-hidden="true">
              <CarThumb carId={p.today.carId} kind={p.today.kind} />
              <span className="persona-arrow">←</span>
              <CarThumb carId={p.alternative.carId} kind={p.alternative.kind} />
            </span>
            <span className="persona-q">״{p.question}״</span>
            <span className="persona-cta">{busy === p.id ? "טוען..." : "▶ הפעלה"}</span>
          </button>
        ))}
      </div>
      {error && (
        <div className="error" role="alert">
          {error}
        </div>
      )}
    </section>
  );
}
