"use client";

/**
 * "מה הכי משתלם לך?": כל החלופות של העובד, מסודרות לפי הנטו.
 * מעל הקו של היום = יותר כסף בחודש, מתחתיו = פחות. לחיצה על חלופה פותחת השוואה מלאה.
 * כל המספרים מגיעים מהכלי rank_alternatives, כלומר ממנוע החישוב.
 */
import { useState, type CSSProperties, type ReactNode } from "react";
import { Bloom } from "./Bloom";
import { CarThumb } from "./CarImage";
import { DRIVES, shekel } from "./cars";
import { Icon } from "./Icon";
import { Confetti, useCountUp } from "./motion";
import type { ChatView, RankedOptionView, RankingView } from "./types";

const SHOW_FIRST = 6;

const signed = (n: number) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${shekel(Math.abs(n))}`;

const nameOf = (o: RankedOptionView) => (o.kind === "waiver" ? "ויתור על הרכב" : (o.model ?? o.label));
const keyOf = (o: RankedOptionView) => o.carId ?? o.kind;
const typeOf = (o: RankedOptionView) => (o.kind === "waiver" ? "waiver" : (o.drive ?? "other"));

function metaOf(o: RankedOptionView): ReactNode {
  if (o.kind === "waiver") return `אחזקת רכב ${shekel(o.maintenance ?? 0)} בחודש`;
  const drive = o.drive ? DRIVES[o.drive] : undefined;
  const group = o.group === "משפחתי" ? "מסלול משפחתי" : `קבוצה ${o.group}`;
  return (
    <>
      {group}
      {drive && (
        <>
          {" · "}
          <Icon name={drive.icon} size={13} /> {drive.label}
        </>
      )}
    </>
  );
}

function tooltipOf(o: RankedOptionView): string {
  const parts = [`נטו בחודש: ${shekel(o.net)}`];
  if (o.participation !== undefined) parts.push(`השתתפות ${shekel(o.participation)}`);
  if (o.electricRefund) parts.push("כולל החזר חשמל");
  return parts.join(" · ");
}

function Winner({ option, onOpen, busy }: { option: RankedOptionView; onOpen?: () => void; busy: boolean }) {
  const amount = useCountUp(option.diffNet);
  return (
    <button type="button" className="winner" onClick={onOpen} disabled={!onOpen || busy}>
      <Bloom size={210} variant="hero" className="winner-bloom" />
      <Confetti />
      <span className="winner-ribbon">
        <Icon name="crown" size={15} /> הכי משתלם לך
      </span>
      <CarThumb carId={option.carId} kind={option.kind} size="big" />
      <span className="winner-body">
        <span className="winner-name">
          <bdi>{nameOf(option)}</bdi>
        </span>
        <span className="winner-meta">{metaOf(option)}</span>
        <span className="winner-amount">
          <bdi>{signed(amount)}</bdi>
        </span>
        <span className="winner-caption">
          יותר בנטו בכל חודש · <bdi>{signed(option.diffNet * 12)}</bdi> בשנה
        </span>
        {onOpen && (
          <span className="winner-cta">
            {busy ? "מחשב..." : "לפירוט המלא"} <Icon name="arrowLeft" size={16} />
          </span>
        )}
      </span>
    </button>
  );
}

export function RankingCard({
  data,
  input,
  sessionId,
  onView,
}: {
  data: RankingView;
  input?: { today?: unknown };
  sessionId?: string | null;
  onView?: (v: ChatView) => void;
}) {
  const [filter, setFilter] = useState("all");
  const [expanded, setExpanded] = useState(false);
  const [opening, setOpening] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { today, options } = data;
  const interactive = Boolean(sessionId && onView && input?.today !== undefined);
  const best = options[0];
  const maxAbs = Math.max(1, ...options.map((o) => Math.abs(o.diffNet)));

  const types = [...new Set(options.map(typeOf))];
  const filtered = filter === "all" ? options : options.filter((o) => typeOf(o) === filter);
  const visible = filter === "all" && !expanded ? filtered.slice(0, SHOW_FIRST) : filtered;
  const baselineAt = visible.findIndex((o) => o.diffNet <= 0);

  async function open(o: RankedOptionView) {
    if (!interactive || opening) return;
    setOpening(keyOf(o));
    setError(null);
    const alternative =
      o.kind === "waiver" ? { kind: "waiver" } : { kind: "car", car: o.carId, participation: o.participation };
    try {
      const res = await fetch("/api/compare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, today: input!.today, alternative }),
      });
      const view = (await res.json()) as ChatView & { error?: string };
      if (!res.ok) setError(view.error ?? "החישוב נכשל");
      else onView!(view);
    } catch {
      setError("אין חיבור לשרת");
    } finally {
      setOpening(null);
    }
  }

  const baseline = (
    <li key="baseline" className="rank-baseline">
      <span className="rank-baseline-pill">
        <CarThumb carId={today.side.carId} kind={today.side.kind} />
        <span>
          היום: <bdi>{today.label}</bdi> · <bdi>{shekel(today.net)}</bdi> נטו
        </span>
      </span>
    </li>
  );

  return (
    <section className="card ranking" aria-label="מה הכי משתלם לך">
      <div className="card-head">
        <div className="card-title">
          <span className="title-icon">
            <Icon name="trophy" />
          </span>
          מה הכי משתלם לך?
        </div>
        <span className="badge count">{options.length} אפשרויות</span>
      </div>
      <p className="ranking-sub">
        כמה ישתנה הנטו שלך בכל חודש, בכל אחת מהאפשרויות שמגיעות לך, לעומת היום (<bdi>{today.label}</bdi>,{" "}
        <bdi>{shekel(today.net)}</bdi> נטו).
      </p>

      {best && best.diffNet > 0 ? (
        <Winner option={best} onOpen={interactive ? () => void open(best) : undefined} busy={opening === keyOf(best)} />
      ) : (
        <div className="today-best">
          <Icon name="check" /> המצב שלך היום משתלם יותר מכל חלופה אחרת, מבחינת הנטו.
        </div>
      )}

      {types.length > 1 && (
        <div className="rank-filters" role="group" aria-label="סינון לפי סוג">
          {["all", ...types].map((t) => {
            const drive = DRIVES[t];
            const label =
              t === "all" ? (
                "הכול"
              ) : t === "waiver" ? (
                <>
                  <Icon name="key" size={15} /> ויתור
                </>
              ) : drive ? (
                <>
                  <Icon name={drive.icon} size={15} /> {drive.label}
                </>
              ) : (
                t
              );
            return (
              <button
                key={t}
                type="button"
                className={`filter-chip${filter === t ? " active" : ""}`}
                aria-pressed={filter === t}
                onClick={() => setFilter(t)}
              >
                {label}
              </button>
            );
          })}
        </div>
      )}

      <ol className="rank-list">
        {visible.map((o, i) => {
          const rank = options.indexOf(o);
          const tone = o.diffNet > 0 ? "gain" : o.diffNet < 0 ? "loss" : "same";
          const row = (
            <li key={keyOf(o)}>
              <button
                type="button"
                className={`rank-row ${tone}`}
                style={{ "--i": i, "--w": `${(Math.abs(o.diffNet) / maxAbs) * 100}%` } as CSSProperties}
                title={tooltipOf(o)}
                onClick={() => void open(o)}
                disabled={!interactive || opening !== null}
              >
                <span className={`rank-pos${o.diffNet > 0 ? (rank === 0 ? " first" : rank < 3 ? " top" : "") : ""}`}>
                  {rank + 1}
                </span>
                <CarThumb carId={o.carId} kind={o.kind} />
                <span className="rank-name">
                  <bdi>{nameOf(o)}</bdi>
                  <span className="rank-meta">{metaOf(o)}</span>
                </span>
                <span className="rank-value">
                  {opening === keyOf(o) ? "מחשב..." : <bdi>{signed(o.diffNet)}</bdi>}
                </span>
                <span className="rank-track">
                  <span className="rank-bar" />
                </span>
              </button>
            </li>
          );
          return i === baselineAt ? [baseline, row] : row;
        })}
        {baselineAt === -1 && visible.length > 0 && (filtered[visible.length]?.diffNet ?? 0) <= 0 && baseline}
      </ol>

      {filter === "all" && filtered.length > SHOW_FIRST && (
        <button type="button" className="link-button" onClick={() => setExpanded(!expanded)}>
          {expanded ? "להציג פחות" : `להציג את כל ${filtered.length} האפשרויות`}
        </button>
      )}
      {error && <div className="error">{error}</div>}

      <p className="muted rank-basis">
        {data.basis}
        {data.notes.map((n) => ` ${n}`)}
        {interactive && " לחיצה על אפשרות פותחת השוואה מלאה."}
      </p>
    </section>
  );
}
