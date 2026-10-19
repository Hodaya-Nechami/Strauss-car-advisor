/**
 * "לאן הלך כל שקל": תרשים מפל מהנטו של היום לנטו בחלופה.
 * כל עמודה היא סיבה אחת לשינוי, עם הסכום שחושב במנוע. העמודות מסתכמות בדיוק להפרש.
 * למעלה = יותר כסף בחשבון, למטה = פחות.
 */
import type { CSSProperties } from "react";
import { shekel } from "./cars";
import { Icon } from "./Icon";
import type { BridgeStepView } from "./types";

const PLOT = 190;
const PAD = 28;

const number = (n: number) => Math.abs(n).toLocaleString("en-US");
const signed = (n: number) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${number(n)}`;

interface Column {
  key: string;
  type: "anchor" | "gain" | "loss" | "total";
  label: string;
  sub?: string;
  value: string;
  from: number;
  to: number;
  detail?: string;
}

export function NetBridge({ todayNet, altNet, steps }: { todayNet: number; altNet: number; steps: BridgeStepView[] }) {
  if (steps.length === 0) return null;
  const total = altNet - todayNet;

  let level = 0;
  const columns: Column[] = [{ key: "today", type: "anchor", label: "נטו היום", value: number(todayNet), from: 0, to: 0 }];
  steps.forEach((s, i) => {
    columns.push({
      key: `${s.kind}-${i}`,
      type: s.amount > 0 ? "gain" : "loss",
      label: s.label,
      value: signed(s.amount),
      from: level,
      to: level + s.amount,
      detail: s.detail,
    });
    level += s.amount;
  });
  columns.push({ key: "total", type: "total", label: "נטו בחלופה", sub: number(altNet), value: signed(total), from: 0, to: total });

  const levels = columns.flatMap((c) => [c.from, c.to]);
  const lo = Math.min(...levels);
  const hi = Math.max(...levels);
  const span = hi - lo || 1;
  const track = PLOT - PAD * 2;
  const pct = (v: number) => ((v - lo) / span) * 100;

  return (
    <figure className="wf" aria-labelledby="wf-title">
      <figcaption className="wf-head">
        <span id="wf-title" className="wf-title">
          <span className="title-icon small">
            <Icon name="chart" size={17} />
          </span>
          לאן הלך כל שקל?
        </span>
        <span className="wf-legend" aria-hidden="true">
          <span>
            <i className="key gain" /> מוסיף לנטו
          </span>
          <span>
            <i className="key loss" /> מוריד מהנטו
          </span>
          <span>
            <i className="key total" /> השינוי בחודש
          </span>
        </span>
      </figcaption>

      <div className="wf-plot" style={{ "--n": columns.length, "--plot": `${PLOT}px` } as CSSProperties} aria-hidden="true">
        <span className="wf-zero" style={{ top: PAD + (1 - pct(0) / 100) * track }} />
        {columns.map((c, i) => {
          const bottom = pct(Math.min(c.from, c.to));
          const top = pct(Math.max(c.from, c.to));
          const down = c.type === "loss" || (c.type === "total" && c.to < 0);
          const next = columns[i + 1];
          return (
            <div key={c.key} className={`wf-col ${c.type}`} style={{ "--i": i } as CSSProperties}>
              <div className="wf-area">
                <div className="wf-track" style={{ inset: `${PAD}px 0` }}>
                  {c.type === "anchor" ? (
                    <span className="wf-mark" style={{ bottom: `${bottom}%` }} />
                  ) : (
                    <span
                      className={`wf-bar${down ? " down" : ""}`}
                      style={{ bottom: `${bottom}%`, height: `max(3px, ${top - bottom}%)` }}
                    />
                  )}
                  <span
                    className="wf-value"
                    style={down ? { top: `calc(${100 - bottom}% + 4px)` } : { bottom: `calc(${top}% + 4px)` }}
                  >
                    <bdi>{c.value}</bdi>
                  </span>
                  {next && c.type !== "total" && <span className="wf-link" style={{ bottom: `${pct(c.to)}%` }} />}
                </div>
                {c.detail && <span className="wf-tip">{c.detail}</span>}
              </div>
              <div className="wf-label">
                {c.label}
                {c.sub && (
                  <small>
                    <bdi>{c.sub}</bdi>
                  </small>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <ul className="sr-only">
        <li>נטו היום: {shekel(todayNet)}</li>
        {steps.map((s, i) => (
          <li key={i}>
            {s.label}: {signed(s.amount)} ₪ ({s.detail})
          </li>
        ))}
        <li>
          נטו בחלופה: {shekel(altNet)}, שינוי של {signed(total)} ₪ בחודש
        </li>
      </ul>
      <p className="wf-note">כל הסכומים בשקלים, בכל חודש. שווי שימוש הוא לא כסף: הוא רק מעלה או מוריד את המס.</p>
    </figure>
  );
}
