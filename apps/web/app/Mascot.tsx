/**
 * "נטו": הדמות של היועץ. מכונית קטנה עם פרצוף, ומטבע של שקל על האנטנה.
 * מצבי רוח: idle (ממצמץ), thinking (קופץ, הגלגלים מסתובבים), happy (הנטו עולה),
 * sad (הנטו יורד), waiting (מחכה לנציג, עם טלפון).
 * מצויר ב-SVG, בלי קבצים חיצוניים. האנימציות נכבות למי שביקש פחות תנועה.
 */
import { useId } from "react";

export type MascotMood = "idle" | "thinking" | "happy" | "sad" | "waiting";

const INK = "#2b2350";

export function Mascot({ mood = "idle", size = 64, title }: { mood?: MascotMood; size?: number; title?: string }) {
  const id = useId().replace(/:/g, "");
  const look = { idle: [0, 0], thinking: [2, -2.5], happy: [0, 0], sad: [0, 1.5], waiting: [2.5, 0] }[mood];

  return (
    <svg
      className={`mascot mascot-${mood}`}
      width={size}
      height={(size * 120) / 140}
      viewBox="0 0 140 120"
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      <defs>
        <linearGradient id={`body-${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#8f72ff" />
          <stop offset="1" stopColor="#5b3fd6" />
        </linearGradient>
        <linearGradient id={`cabin-${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#7a5cff" />
          <stop offset="1" stopColor="#4c31c2" />
        </linearGradient>
        <radialGradient id={`glow-${id}`}>
          <stop offset="0" stopColor="#fff6c2" />
          <stop offset="1" stopColor="#ffd34d" />
        </radialGradient>
      </defs>

      <ellipse cx="70" cy="110" rx="50" ry="6" fill="rgba(20, 10, 60, 0.14)" />

      <g className="mascot-body">
        {/* אנטנה עם מטבע */}
        <line x1="92" y1="25" x2="101" y2="9" stroke={INK} strokeWidth="2.5" strokeLinecap="round" />
        <g className="mascot-coin">
          <circle cx="102" cy="8" r="7" fill="#f7c948" stroke="#d99a00" strokeWidth="1.5" />
          <text x="102" y="11.2" textAnchor="middle" fontSize="9" fontWeight="700" fill="#8a5a00" fontFamily="Arial">
            ₪
          </text>
        </g>

        {/* גג וחלון קדמי שהוא הפנים */}
        <rect x="30" y="20" width="80" height="46" rx="22" fill={`url(#cabin-${id})`} />
        <rect x="39" y="28" width="62" height="31" rx="14" fill="#eef0ff" />
        <path d="M44 33 Q52 29 60 30" stroke="#ffffff" strokeWidth="3" strokeLinecap="round" fill="none" opacity="0.9" />

        {/* גוף */}
        <rect x="10" y="55" width="120" height="38" rx="19" fill={`url(#body-${id})`} />
        <path d="M24 60 Q70 54 116 60" stroke="#ffffff" strokeWidth="2" fill="none" opacity="0.25" />

        {/* פנסים */}
        <circle cx="22" cy="72" r="6" fill={`url(#glow-${id})`} stroke="#e6a800" strokeWidth="1.2" />
        <circle cx="118" cy="72" r="6" fill={`url(#glow-${id})`} stroke="#e6a800" strokeWidth="1.2" />

        {/* עיניים */}
        {mood === "happy" ? (
          <g stroke={INK} strokeWidth="3.2" strokeLinecap="round" fill="none">
            <path d="M51 46 Q58 37 65 46" />
            <path d="M75 46 Q82 37 89 46" />
          </g>
        ) : (
          <g className="mascot-eyes">
            <circle cx="58" cy="44" r="8" fill="#ffffff" stroke={INK} strokeWidth="1.6" />
            <circle cx="82" cy="44" r="8" fill="#ffffff" stroke={INK} strokeWidth="1.6" />
            <circle cx={58 + look[0]!} cy={44 + look[1]!} r="3.8" fill={INK} />
            <circle cx={82 + look[0]!} cy={44 + look[1]!} r="3.8" fill={INK} />
            <circle cx={59.3 + look[0]!} cy={42.6 + look[1]!} r="1.3" fill="#ffffff" />
            <circle cx={83.3 + look[0]!} cy={42.6 + look[1]!} r="1.3" fill="#ffffff" />
          </g>
        )}

        {/* גבות מודאגות */}
        {mood === "sad" && (
          <g stroke={INK} strokeWidth="2.4" strokeLinecap="round">
            <line x1="50" y1="35" x2="62" y2="31.5" />
            <line x1="90" y1="35" x2="78" y2="31.5" />
          </g>
        )}

        {/* לחיים */}
        {(mood === "happy" || mood === "idle") && (
          <g fill="#ff8fab" opacity={mood === "happy" ? 0.85 : 0.45}>
            <ellipse cx="36" cy="68" rx="5" ry="3.2" />
            <ellipse cx="104" cy="68" rx="5" ry="3.2" />
          </g>
        )}

        {/* פה */}
        {mood === "idle" && <path d="M61 71 Q70 79 79 71" stroke={INK} strokeWidth="3" strokeLinecap="round" fill="none" />}
        {mood === "happy" && (
          <g>
            <path d="M57 68 Q70 86 83 68 Z" fill={INK} />
            <path d="M63 77 Q70 82 77 77 Q70 74 63 77 Z" fill="#ff6b8b" />
          </g>
        )}
        {mood === "thinking" && <circle cx="73" cy="74" r="3.6" fill={INK} />}
        {mood === "sad" && (
          <path d="M60 76 Q65 71.5 70 76 Q75 80.5 80 76" stroke={INK} strokeWidth="3" strokeLinecap="round" fill="none" />
        )}
        {mood === "waiting" && <path d="M62 74 L78 74" stroke={INK} strokeWidth="3" strokeLinecap="round" />}
      </g>

      {/* גלגלים */}
      {[40, 100].map((cx) => (
        <g key={cx} className="mascot-wheel">
          <circle cx={cx} cy="94" r="12.5" fill="#2b2d42" />
          <circle cx={cx} cy="94" r="5.5" fill="#d7d9e6" />
          <circle cx={cx + 3.2} cy="94" r="1.8" fill="#2b2d42" />
        </g>
      ))}

      {/* תוספות לפי מצב הרוח */}
      {mood === "thinking" && (
        <g className="mascot-dots" fill="#b9a8ff">
          <circle cx="26" cy="26" r="3" />
          <circle cx="16" cy="16" r="4" />
          <circle cx="6" cy="5" r="5" />
        </g>
      )}
      {mood === "happy" && (
        <g className="mascot-sparkles" fill="#ffc83d">
          <path d="M18 18 l2.5 6 6 2.5 -6 2.5 -2.5 6 -2.5 -6 -6 -2.5 6 -2.5z" />
          <path d="M124 30 l1.8 4.2 4.2 1.8 -4.2 1.8 -1.8 4.2 -1.8 -4.2 -4.2 -1.8 4.2 -1.8z" />
        </g>
      )}
      {mood === "waiting" && (
        <g className="mascot-phone">
          <rect x="116" y="30" width="13" height="22" rx="3" fill="#33384f" transform="rotate(12 122 41)" />
          <rect x="118.5" y="33" width="8" height="13" rx="1.5" fill="#9fe8ff" transform="rotate(12 122 41)" />
          <path d="M131 26 q4 4 0 8 M134 23 q7 7 0 14" stroke="#9a86ff" strokeWidth="2" fill="none" strokeLinecap="round" />
        </g>
      )}
    </svg>
  );
}
