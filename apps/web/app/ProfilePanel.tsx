"use client";

/** הנתונים שהעובד מסר, עם אפשרות לתקן אותם בלי לכתוב לבוט */
import { useEffect, useState, type FormEvent } from "react";
import type { ChatView, Profile } from "./types";

const NUMBER_FIELDS: { key: keyof Profile; label: string; step: string }[] = [
  { key: "baseSalary", label: "שכר בסיס חודשי (₪)", step: "1" },
  { key: "commissions", label: "עמלות חודשיות (₪)", step: "1" },
  { key: "bonus", label: "בונוס חודשי (₪)", step: "1" },
  { key: "pensionRate", label: "הפרשה לפנסיה (%)", step: "0.1" },
  { key: "studyFundRate", label: "הפרשה לקרן השתלמות (%)", step: "0.1" },
  { key: "creditPoints", label: "נקודות זיכוי", step: "0.25" },
  { key: "childrenUnder23", label: "ילדים עד גיל 23", step: "1" },
];

const GROUPS = ["א", "ב", "ג", "ד"];

function toStrings(p: Profile): Record<string, string> {
  return Object.fromEntries(
    [...NUMBER_FIELDS.map((f) => f.key), "group" as const].map((k) => [k, p[k] === undefined ? "" : String(p[k])]),
  );
}

export function ProfilePanel({
  sessionId,
  profile,
  onView,
}: {
  sessionId: string;
  profile: Profile;
  onView: (v: ChatView) => void;
}) {
  const [values, setValues] = useState(() => toStrings(profile));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const profileKey = JSON.stringify(profile);

  // כשהבוט שומר נתונים חדשים, הטופס מתעדכן
  useEffect(() => {
    setValues(toStrings(JSON.parse(profileKey) as Profile));
  }, [profileKey]);

  const filled = Object.values(profile).filter((v) => v !== undefined).length;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const patch: Record<string, unknown> = {};
    if (values.group) patch.group = values.group;
    for (const f of NUMBER_FIELDS) {
      const raw = values[f.key]?.trim() ?? "";
      if (raw === "") continue;
      const n = Number(raw);
      if (!Number.isFinite(n) || n < 0) {
        setError(`הערך של "${f.label}" לא תקין`);
        return;
      }
      patch[f.key] = n;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, profile: patch }),
      });
      const data = (await res.json()) as ChatView & { error?: string };
      if (!res.ok) setError(data.error ?? "העדכון נכשל");
      else onView(data);
    } catch {
      setError("אין חיבור לשרת");
    } finally {
      setBusy(false);
    }
  }

  return (
    <details className="profile">
      <summary>
        הנתונים שלי <span className="muted">({filled} שדות)</span>
      </summary>
      <form onSubmit={submit} className="profile-form">
        <label>
          קבוצת זכאות
          <select value={values.group} onChange={(e) => setValues({ ...values, group: e.target.value })}>
            <option value="">לא ידוע</option>
            {GROUPS.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
        </label>
        {NUMBER_FIELDS.map((f) => (
          <label key={f.key}>
            {f.label}
            <input
              type="number"
              min="0"
              step={f.step}
              inputMode="decimal"
              value={values[f.key]}
              onChange={(e) => setValues({ ...values, [f.key]: e.target.value })}
            />
          </label>
        ))}
        {profile.occupation && <div className="muted">עיסוק: {profile.occupation}</div>}
        <button type="submit" className="small-button" disabled={busy}>
          {busy ? "שומר..." : "שמירה"}
        </button>
        {error && <div className="error">{error}</div>}
      </form>
    </details>
  );
}
