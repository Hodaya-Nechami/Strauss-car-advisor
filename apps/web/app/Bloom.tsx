/**
 * הפריחה: להבים מעוקלים שמסתחררים סביב מרכז, בצבעים ובסידור של הסמל של שטראוס.
 * מצויר מחדש בקוד. את קובץ הלוגו הרשמי מוסיפים רק באישור החברה.
 * hero: נפתחת להב אחרי להב ומתנדנדת בעדינות. thinking: מסתובבת מהר, כמו "טוען". mark: סמל קטן.
 */
import type { CSSProperties } from "react";

export const PETALS = {
  red: "#E42418",
  orange: "#F06C18",
  lime: "#C0E46C",
  green: "#6C9C18",
  blue: "#3C90CC",
  sky: "#48C0E4",
  cyan: "#90D8E4",
};

/** להב שמתחיל במרכז, קמור בצד אחד ומחודד בקצה, כך שכל הפריחה מסתחררת */
export function bladePath(length: number, width: number): string {
  const L = length;
  const W = width;
  return `M0 0 C${W * 0.75} ${-L * 0.2} ${W * 1.1} ${-L * 0.62} ${W * 0.55} ${-L} C${W * 0.3} ${-L * 0.72} ${-W * 0.3} ${-L * 0.38} 0 0Z`;
}

/** [צבע, זווית, אורך, יחס רוחב]. הארוכים מצוירים קודם, והקצרים מעליהם, כמו בסמל. */
const BLADES: [string, number, number, number][] = [
  [PETALS.lime, 6, 100, 0.25],
  [PETALS.cyan, 141, 90, 0.25],
  [PETALS.green, 72, 86, 0.25],
  [PETALS.blue, 94, 80, 0.27],
  [PETALS.lime, -40, 78, 0.28],
  [PETALS.lime, 38, 72, 0.28],
  [PETALS.sky, 116, 70, 0.3],
  [PETALS.red, -96, 70, 0.34],
  [PETALS.green, -28, 60, 0.3],
  [PETALS.orange, -74, 52, 0.36],
  [PETALS.orange, 0, 56, 0.3],
  [PETALS.blue, 156, 64, 0.28],
  [PETALS.red, 172, 62, 0.32],
];

export function Bloom({
  size = 320,
  variant = "hero",
  className = "",
}: {
  size?: number;
  variant?: "hero" | "thinking" | "mark";
  className?: string;
}) {
  return (
    <svg
      className={`bloom bloom-${variant} ${className}`}
      width={size}
      height={size}
      viewBox="-112 -112 224 224"
      aria-hidden="true"
    >
      <g className="bloom-spin">
        <g transform="translate(-6 12)">
          {BLADES.map(([color, angle, length, ratio], i) => (
            <path
              key={i}
              className="petal"
              d={bladePath(length, length * ratio)}
              fill={color}
              style={{ "--r": `${angle}deg`, "--i": i } as CSSProperties}
            />
          ))}
          {variant !== "mark" && (
            <g className="droplets">
              <path d="M50 -50 q12 -6 20 2 q-11 -2 -20 -2Z" fill={PETALS.green} />
              <path d="M70 40 q10 2 12 12 q-6 -6 -12 -12Z" fill={PETALS.blue} />
            </g>
          )}
        </g>
      </g>
    </svg>
  );
}

const FALLING: { color: string; left: number; t: number; d: number; sway: number; size: number; spin: number }[] = [
  { color: PETALS.red, left: 4, t: 24, d: -3, sway: 60, size: 1, spin: 380 },
  { color: PETALS.lime, left: 13, t: 31, d: -17, sway: -40, size: 0.8, spin: -300 },
  { color: PETALS.sky, left: 22, t: 27, d: -9, sway: 70, size: 1.15, spin: 420 },
  { color: PETALS.orange, left: 33, t: 35, d: -22, sway: -55, size: 0.9, spin: -360 },
  { color: PETALS.green, left: 44, t: 29, d: -5, sway: 45, size: 0.75, spin: 300 },
  { color: PETALS.blue, left: 55, t: 33, d: -27, sway: -60, size: 1, spin: -420 },
  { color: PETALS.cyan, left: 64, t: 26, d: -13, sway: 50, size: 0.85, spin: 340 },
  { color: PETALS.red, left: 73, t: 37, d: -31, sway: -45, size: 0.7, spin: -300 },
  { color: PETALS.lime, left: 82, t: 30, d: -8, sway: 55, size: 1.05, spin: 400 },
  { color: PETALS.orange, left: 91, t: 34, d: -19, sway: -50, size: 0.9, spin: -380 },
];

/** להבים שנושרים לאט על פני כל המסך. נכבים למי שביקש פחות תנועה. */
export function Ambient() {
  const blade = bladePath(30, 9);
  return (
    <div className="ambient" aria-hidden="true">
      {FALLING.map((p, i) => (
        <svg
          key={i}
          viewBox="-12 -32 24 34"
          className={i % 3 === 2 ? "extra" : undefined}
          style={
            {
              left: `${p.left}%`,
              width: `${16 * p.size}px`,
              "--t": `${p.t}s`,
              "--d": `${p.d}s`,
              "--sway": `${p.sway}px`,
              "--spin": `${p.spin}deg`,
            } as CSSProperties
          }
        >
          <path d={blade} fill={p.color} />
        </svg>
      ))}
    </div>
  );
}
