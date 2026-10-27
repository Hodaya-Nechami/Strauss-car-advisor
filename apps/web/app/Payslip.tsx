"use client";

/**
 * העלאת תלוש שכר: העובד מעלה תלוש, נטבוט קורא ממנו את הנתונים, והעובד מאשר לפני שמירה.
 * שום דבר לא נשמר בלי אישור, והתלוש עצמו לא נשמר בכלל.
 */
import { useEffect, useRef, useState, type DragEvent, type FormEvent, type ReactNode } from "react";
import { shekel } from "./cars";
import { Icon } from "./Icon";
import { Mascot } from "./Mascot";
import type { ChatView, PayslipFieldKey, PayslipReading } from "./types";

const ACCEPT = "application/pdf,image/jpeg,image/png,image/webp,image/heic";
const MAX_BYTES = 8 * 1024 * 1024;
const SAMPLE = "/samples/payslip-sample.pdf";

export type PayslipState =
  | { phase: "idle" }
  | { phase: "reading"; name: string }
  | { phase: "review"; reading: PayslipReading }
  | { phase: "error"; message: string };

/** הקריאה עצמה: בדיקה בדפדפן, שליחה לשרת, ומצב לתצוגה */
export function usePayslip() {
  const [slip, setSlip] = useState<PayslipState>({ phase: "idle" });

  async function readFile(file: File) {
    if (!ACCEPT.split(",").includes(file.type)) {
      setSlip({ phase: "error", message: "אפשר להעלות תלוש כקובץ PDF או כתמונה (JPG או PNG)." });
      return;
    }
    if (file.size > MAX_BYTES) {
      setSlip({ phase: "error", message: "הקובץ גדול מדי. אפשר להעלות קובץ עד 8MB." });
      return;
    }
    setSlip({ phase: "reading", name: file.name });
    const form = new FormData();
    form.append("file", file);
    try {
      const res = await fetch("/api/payslip", { method: "POST", body: form });
      // כשהשרת מתעורר או לא עונה בזמן, Render מחזיר דף HTML ולא JSON
      const data = (await res.json().catch(() => null)) as (PayslipReading & { error?: string }) | null;
      if (!data) {
        // הקוד עוזר להבין מי ענה: 502/503 השרת קרס או מתעורר, 524 נגמר הזמן, 403/418 סינון אינטרנט
        setSlip({
          phase: "error",
          message: `השרת לא ענה בזמן, אולי כי הוא רק מתעורר. נסו שוב בעוד דקה. (קוד ${res.status})`,
        });
      } else if (!res.ok) setSlip({ phase: "error", message: data.error ?? "לא הצלחתי לקרוא את התלוש." });
      else setSlip({ phase: "review", reading: data });
    } catch {
      setSlip({ phase: "error", message: "אין חיבור לשרת. בדקו שהוא רץ ונסו שוב." });
    }
  }

  async function readSample() {
    try {
      const blob = await (await fetch(SAMPLE)).blob();
      await readFile(new File([blob], "תלוש-לדוגמה.pdf", { type: "application/pdf" }));
    } catch {
      setSlip({ phase: "error", message: "לא הצלחתי לטעון את התלוש לדוגמה." });
    }
  }

  return { slip, readFile, readSample, reset: () => setSlip({ phase: "idle" }) };
}

/** כפתור כלשהו שפותח בחירת תלוש */
export function PickPayslip({
  onFile,
  className,
  children,
}: {
  onFile: (f: File) => void;
  className?: string;
  children: ReactNode;
}) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <>
      <button type="button" className={className} onClick={() => input.current?.click()}>
        {children}
      </button>
      <input
        ref={input}
        type="file"
        accept={ACCEPT}
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) onFile(f);
        }}
      />
    </>
  );
}

/** כפתור קטן עם קובץ נסתר, לשורת הכתיבה */
export function AttachButton({ onFile, disabled }: { onFile: (f: File) => void; disabled?: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <>
      <button
        type="button"
        className="attach-button"
        onClick={() => input.current?.click()}
        disabled={disabled}
        aria-label="העלאת תלוש שכר"
        title="העלאת תלוש שכר"
      >
        <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
          <path
            d="M16.5 6.5 8.6 14.4a2 2 0 0 0 2.8 2.8l8-8a4 4 0 0 0-5.6-5.6l-8.2 8.2a6 6 0 0 0 8.5 8.5l6.4-6.4"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.9"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
      <input
        ref={input}
        type="file"
        accept={ACCEPT}
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) onFile(f);
        }}
      />
    </>
  );
}

/** אזור גרירה במסך הפתיחה */
export function PayslipDropzone({ onFile, onSample }: { onFile: (f: File) => void; onSample: () => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);

  function drop(e: DragEvent) {
    e.preventDefault();
    setOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f) onFile(f);
  }

  return (
    <section
      className={`dropzone${over ? " over" : ""}`}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={drop}
    >
      <div className="dropzone-icon" aria-hidden="true">
        <span className="doc">
          <i />
          <i />
          <i />
        </span>
      </div>
      <div className="dropzone-text">
        <h3>יש לך תלוש שכר? אני אקרא אותו בשבילך</h3>
        <p>במקום להקליד שכר, פנסיה ונקודות זיכוי: העלו תלוש, ואני אמלא הכול. תראו בדיוק מה קראתי, ותאשרו לפני שמירה.</p>
        <div className="dropzone-actions">
          <button type="button" className="small-button" onClick={() => input.current?.click()}>
            <Icon name="upload" size={18} /> העלאת תלוש
          </button>
          <button type="button" className="link-button" onClick={onSample}>
            אין תלוש בהישג יד? נסו עם תלוש לדוגמה
          </button>
        </div>
        <p className="dropzone-privacy">
          <Icon name="lock" size={15} /> התלוש נשלח לקריאה ולא נשמר אצלנו. בגרסת ההדגמה השתמשו רק בתלוש לדוגמה, לא
          בתלוש אמיתי.
        </p>
      </div>
      <input
        ref={input}
        type="file"
        accept={ACCEPT}
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) onFile(f);
        }}
      />
    </section>
  );
}

const STEPS = ["נטבוט קורא את התלוש...", "מחפש את שכר הבסיס וההפרשות...", "בודק את נקודות הזיכוי...", "עוד רגע, כמעט סיימתי..."];

function Reading({ name }: { name: string }) {
  const [step, setStep] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setStep((s) => Math.min(s + 1, STEPS.length - 1)), 5000);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="slip-reading" role="status">
      <div className="scan" aria-hidden="true">
        <span className="doc big">
          <i />
          <i />
          <i />
          <i />
        </span>
        <span className="scan-line" />
      </div>
      <div>
        <strong>{STEPS[step]}</strong>
        <div className="muted">{name}. קריאת תלוש לוקחת בדרך כלל עד דקה.</div>
      </div>
    </div>
  );
}

const FIELDS: { key: PayslipFieldKey; label: string; unit: string; step: string }[] = [
  { key: "baseSalary", label: "שכר בסיס חודשי", unit: "₪", step: "1" },
  { key: "commissions", label: "עמלות", unit: "₪", step: "1" },
  { key: "bonus", label: "בונוס", unit: "₪", step: "1" },
  { key: "pensionRate", label: "הפרשה לפנסיה", unit: "%", step: "0.01" },
  { key: "studyFundRate", label: "הפרשה לקרן השתלמות", unit: "%", step: "0.01" },
  { key: "creditPoints", label: "נקודות זיכוי", unit: "", step: "0.25" },
];

function Review({
  reading,
  sessionId,
  onView,
  onDone,
}: {
  reading: PayslipReading;
  sessionId: string | null;
  onView: (v: ChatView) => void;
  onDone: () => void;
}) {
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(FIELDS.map((f) => [f.key, reading.fields[f.key] ? String(reading.fields[f.key]!.value) : ""])),
  );
  const [group, setGroup] = useState("");
  const participation = reading.car.participation;
  const [useParticipation, setUseParticipation] = useState(Boolean(participation));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(e: FormEvent) {
    e.preventDefault();
    const profile: Record<string, number | string> = {};
    for (const f of FIELDS) {
      const raw = values[f.key]?.trim() ?? "";
      if (raw === "") continue;
      const n = Number(raw);
      if (!Number.isFinite(n) || n < 0) {
        setError(`הערך של "${f.label}" לא תקין`);
        return;
      }
      profile[f.key] = n;
    }
    if (group) profile.group = group;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId,
          profile,
          payslip: {
            carParticipation: useParticipation ? participation?.value : undefined,
            carValueOfUse: reading.car.valueOfUse?.value,
          },
        }),
      });
      const data = (await res.json()) as ChatView & { error?: string };
      if (!res.ok) setError(data.error ?? "השמירה נכשלה");
      else {
        onView(data);
        onDone();
      }
    } catch {
      setError("אין חיבור לשרת");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="slip-review" onSubmit={save}>
      <div className="card-head">
        <div className="card-title">
          <span className="title-icon">
            <Icon name="doc" />
          </span>
          זה מה שקראתי מהתלוש{reading.period ? ` (${reading.period})` : ""}
        </div>
        <span className="badge needs_info">לאישורך</span>
      </div>
      <p className="muted">בדקו שהכול נכון, ותקנו אם צריך. שום דבר לא נשמר עד שתאשרו, והתלוש עצמו לא נשמר בכלל.</p>

      <div className="slip-grid">
        {FIELDS.map((f) => {
          const v = reading.fields[f.key];
          return (
            <label key={f.key} className={`slip-field${v ? (v.assumedZero ? " assumed" : " found") : " missing"}`}>
              <span className="slip-label">
                {f.label}
                {f.unit && <small> ({f.unit})</small>}
              </span>
              <input
                type="number"
                min="0"
                step={f.step}
                inputMode="decimal"
                value={values[f.key]}
                placeholder="לא נמצא, הקלידו"
                onChange={(e) => setValues({ ...values, [f.key]: e.target.value })}
              />
              <span className="slip-source">
                <Icon name={v ? (v.assumedZero ? "dot" : "check") : "alert"} size={13} />
                {v ? v.source : "לא מצאתי בתלוש"}
              </span>
            </label>
          );
        })}
        <label className="slip-field extra">
          <span className="slip-label">קבוצת זכאות</span>
          <select value={group} onChange={(e) => setGroup(e.target.value)}>
            <option value="">לא יודע/ת, נטבוט ישאל</option>
            {["א", "ב", "ג", "ד"].map((g) => (
              <option key={g} value={g}>
                קבוצה {g}
              </option>
            ))}
          </select>
          <span className="slip-source">לא מופיעה בתלוש</span>
        </label>
      </div>

      {(participation || reading.car.valueOfUse) && (
        <div className="slip-car">
          <strong>
            <Icon name="car" size={18} /> מצאתי בתלוש גם את הרכב שלך:
          </strong>
          <ul>
            {reading.car.valueOfUse && (
              <li>
                שווי שימוש <bdi>{shekel(reading.car.valueOfUse.value)}</bdi> בחודש ({reading.car.valueOfUse.source})
              </li>
            )}
          </ul>
          {participation && (
            <label className="check">
              <input type="checkbox" checked={useParticipation} onChange={(e) => setUseParticipation(e.target.checked)} />
              ההשתתפות שלי ברכב היום היא <bdi>{shekel(participation.value)}</bdi> בחודש ({participation.source})
            </label>
          )}
        </div>
      )}

      {reading.notes.length > 0 && (
        <ul className="slip-notes">
          {reading.notes.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      )}

      <div className="slip-actions">
        <button type="submit" className="small-button" disabled={busy}>
          {busy ? (
            "שומר..."
          ) : (
            <>
              <Icon name="check" size={18} /> נכון, לשמור
            </>
          )}
        </button>
        <button type="button" className="ghost-button" onClick={onDone} disabled={busy}>
          ביטול
        </button>
        {reading.via && <span className="muted slip-via">נקרא בעזרת {reading.via}</span>}
      </div>
      {error && <div className="error">{error}</div>}
    </form>
  );
}

/** הכרטיס בשיחה: קורא, מציג לאישור, או מסביר מה השתבש */
export function PayslipCard({
  slip,
  sessionId,
  onView,
  onSaved,
  onDone,
  onSample,
}: {
  slip: PayslipState;
  sessionId: string | null;
  onView: (v: ChatView) => void;
  /** אחרי שמירה: השיחה ממשיכה לשלב הבא */
  onSaved: (v: ChatView) => void;
  onDone: () => void;
  onSample: () => void;
}) {
  if (slip.phase === "idle") return null;
  return (
    <div className="bot-row">
      <div className="avatar">
        <Mascot mood={slip.phase === "reading" ? "thinking" : slip.phase === "error" ? "sad" : "happy"} size={42} />
      </div>
      <div className="bot-content">
        <section className="card slip-card" aria-label="קריאת תלוש שכר">
          {slip.phase === "reading" && <Reading name={slip.name} />}
          {slip.phase === "review" && (
            <Review
              reading={slip.reading}
              sessionId={sessionId}
              onView={(v) => {
                onView(v);
                onSaved(v);
              }}
              onDone={onDone}
            />
          )}
          {slip.phase === "error" && (
            <div className="slip-error">
              <div className="error" role="alert">
                {slip.message}
              </div>
              <div className="slip-actions">
                <button type="button" className="small-button" onClick={onSample}>
                  לנסות עם תלוש לדוגמה
                </button>
                <button type="button" className="ghost-button" onClick={onDone}>
                  סגירה
                </button>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
