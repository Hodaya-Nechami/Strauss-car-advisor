"use client";

/** הנתונים שהעובד מסר, בתפריט הצד: תקציר קריא, ועריכה בלי לכתוב לבוט */
import { useEffect, useState, type FormEvent } from "react";
import { shekel } from "./cars";
import { Icon } from "./Icon";
import type { ChatView, Profile } from "./types";

const NUMBER_FIELDS: { key: keyof Profile; label: string; step: string }[] = [
  { key: "baseSalary", label: "שכר בסיס (₪)", step: "1" },
  { key: "commissions", label: "עמלות (₪)", step: "1" },
  { key: "bonus", label: "בונוס (₪)", step: "1" },
  { key: "pensionRate", label: "פנסיה (%)", step: "0.1" },
  { key: "studyFundRate", label: "קרן השתלמות (%)", step: "0.1" },
  { key: "creditPoints", label: "נקודות זיכוי", step: "0.25" },
  { key: "childrenUnder23", label: "ילדים עד 23", step: "1" },
];

const GROUPS = ["א", "ב", "ג", "ד"];

/** איך כל נתון נראה בתקציר */
const SUMMARY: { key: keyof Profile; label: string; show: (v: number | string) => string }[] = [
  { key: "group", label: "קבוצת זכאות", show: (v) => String(v) },
  { key: "baseSalary", label: "שכר בסיס", show: (v) => shekel(Number(v)) },
  { key: "commissions", label: "עמלות", show: (v) => shekel(Number(v)) },
  { key: "bonus", label: "בונוס", show: (v) => shekel(Number(v)) },
  { key: "pensionRate", label: "פנסיה", show: (v) => `${v}%` },
  { key: "studyFundRate", label: "קרן השתלמות", show: (v) => `${v}%` },
  { key: "creditPoints", label: "נקודות זיכוי", show: (v) => String(v) },
  { key: "childrenUnder23", label: "ילדים עד 23", show: (v) => String(v) },
];

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
  const [editing, setEditing] = useState(false);
  const [values, setValues] = useState(() => toStrings(profile));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const profileKey = JSON.stringify(profile);

  // כשהבוט שומר נתונים חדשים, הטופס מתעדכן
  useEffect(() => {
    setValues(toStrings(JSON.parse(profileKey) as Profile));
  }, [profileKey]);

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
      else {
        onView(data);
        setEditing(false);
      }
    } catch {
      setError("אין חיבור לשרת");
    } finally {
      setBusy(false);
    }
  }

  const known = SUMMARY.filter((s) => profile[s.key] !== undefined);

  return (
    <div className="profile">
      {!editing && (
        <>
          <dl className="profile-summary">
            {known.map((s) => (
              <div key={s.key}>
                <dt>{s.label}</dt>
                <dd>
                  <bdi>{s.show(profile[s.key] as number | string)}</bdi>
                </dd>
              </div>
            ))}
          </dl>
          {profile.occupation && <div className="profile-occupation">{profile.occupation}</div>}
          <button type="button" className="rail-link" onClick={() => setEditing(true)}>
            <Icon name="edit" size={16} /> תיקון נתונים
          </button>
        </>
      )}
      {editing && (
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
          <div className="profile-actions">
            <button type="submit" className="small-button" disabled={busy}>
              {busy ? "שומר..." : "שמירה"}
            </button>
            <button type="button" className="rail-link" onClick={() => setEditing(false)} disabled={busy}>
              ביטול
            </button>
          </div>
          {error && <div className="error">{error}</div>}
        </form>
      )}
    </div>
  );
}
