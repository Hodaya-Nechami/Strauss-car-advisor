/**
 * "נטו": הדמות של היועץ. מכונית קטנה באדום של שטראוס עם פרצוף, ומטבע של שקל על האנטנה.
 * מצבי רוח: idle (ממצמץ), thinking (קופץ, הגלגלים מסתובבים), happy (הנטו עולה),
 * sad (הנטו יורד), waiting (מחכה לנציג, עם טלפון).
 * מצויר ב-SVG, בלי קבצים חיצוניים. האנימציות נכבות למי שביקש פחות תנועה.
 */
import { useId } from "react";

export type MascotMood = "idle" | "thinking" | "happy" | "sad" | "waiting";

const INK = "#2A1B1F";

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
          <stop offset="0" stopColor="#FF5B4D" />
          <stop offset="1" stopColor="#C81E14" />
        </linearGradient>
        <linearGradient id={`cabin-${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#F2453A" />
          <stop offset="1" stopColor="#B3170F" />
        </linearGradient>
        <linearGradient id={`glass-${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#FFFFFF" />
          <stop offset="1" stopColor="#E6F6FC" />
        </linearGradient>
        <radialGradient id={`glow-${id}`}>
          <stop offset="0" stopColor="#FFF8D6" />
          <stop offset="1" stopColor="#FFC94D" />
        </radialGradient>
      </defs>

      <ellipse cx="70" cy="110" rx="50" ry="6" fill="rgba(60, 20, 15, 0.16)" />

      <g className="mascot-body">
        {/* אנטנה עם מטבע */}
        <line x1="92" y1="25" x2="101" y2="9" stroke={INK} strokeWidth="2.5" strokeLinecap="round" />
        <g className="mascot-coin">
          <circle cx="102" cy="8" r="7" fill="#F7C948" stroke="#D99A00" strokeWidth="1.5" />
          <text x="102" y="11.2" textAnchor="middle" fontSize="9" fontWeight="700" fill="#8A5A00" fontFamily="Arial">
            ₪
          </text>
        </g>

        {/* גג וחלון קדמי שהוא הפנים */}
        <rect x="30" y="20" width="80" height="46" rx="22" fill={`url(#cabin-${id})`} />
        <rect x="39" y="28" width="62" height="31" rx="14" fill={`url(#glass-${id})`} />
        <path d="M44 33 Q52 29 60 30" stroke="#ffffff" strokeWidth="3" strokeLinecap="round" fill="none" opacity="0.95" />

        {/* גוף */}
        <rect x="10" y="55" width="120" height="38" rx="19" fill={`url(#body-${id})`} />
        <path d="M24 60 Q70 54 116 60" stroke="#ffffff" strokeWidth="2" fill="none" opacity="0.3" />
        {/* פס צבעוני בצבעי הפריחה */}
        <g strokeWidth="3" strokeLinecap="round" opacity="0.95">
          <line x1="40" y1="85" x2="52" y2="85" stroke="#C2E46F" />
          <line x1="56" y1="85" x2="68" y2="85" stroke="#4AC1E6" />
          <line x1="72" y1="85" x2="84" y2="85" stroke="#F26D1F" />
          <line x1="88" y1="85" x2="100" y2="85" stroke="#3D91CF" />
        </g>

        {/* פנסים */}
        <circle cx="22" cy="72" r="6" fill={`url(#glow-${id})`} stroke="#E6A800" strokeWidth="1.2" />
        <circle cx="118" cy="72" r="6" fill={`url(#glow-${id})`} stroke="#E6A800" strokeWidth="1.2" />

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
          <g fill="#FFB199" opacity={mood === "happy" ? 0.95 : 0.6}>
            <ellipse cx="36" cy="68" rx="5" ry="3.2" />
            <ellipse cx="104" cy="68" rx="5" ry="3.2" />
          </g>
        )}

        {/* פה */}
        {mood === "idle" && <path d="M61 71 Q70 79 79 71" stroke={INK} strokeWidth="3" strokeLinecap="round" fill="none" />}
        {mood === "happy" && (
          <g>
            <path d="M57 68 Q70 86 83 68 Z" fill={INK} />
            <path d="M63 77 Q70 82 77 77 Q70 74 63 77 Z" fill="#FF8A7A" />
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
          <circle cx={cx} cy="94" r="12.5" fill="#2A2228" />
          <circle cx={cx} cy="94" r="5.5" fill="#E2DCD6" />
          <circle cx={cx + 3.2} cy="94" r="1.8" fill="#2A2228" />
        </g>
      ))}

      {/* תוספות לפי מצב הרוח */}
      {mood === "thinking" && (
        <g className="mascot-dots">
          <circle cx="26" cy="26" r="3" fill="#F26D1F" />
          <circle cx="16" cy="16" r="4" fill="#C2E46F" />
          <circle cx="6" cy="5" r="5" fill="#4AC1E6" />
        </g>
      )}
      {mood === "happy" && (
        <g className="mascot-sparkles">
          <path d="M18 18 l2.5 6 6 2.5 -6 2.5 -2.5 6 -2.5 -6 -6 -2.5 6 -2.5z" fill="#FFC83D" />
          <path d="M124 30 l1.8 4.2 4.2 1.8 -4.2 1.8 -1.8 4.2 -1.8 -4.2 -4.2 -1.8 4.2 -1.8z" fill="#4AC1E6" />
        </g>
      )}
      {mood === "waiting" && (
        <g className="mascot-phone">
          <rect x="116" y="30" width="13" height="22" rx="3" fill="#33384f" transform="rotate(12 122 41)" />
          <rect x="118.5" y="33" width="8" height="13" rx="1.5" fill="#9fe8ff" transform="rotate(12 122 41)" />
          <path d="M131 26 q4 4 0 8 M134 23 q7 7 0 14" stroke="#4AC1E6" strokeWidth="2" fill="none" strokeLinecap="round" />
        </g>
      )}
    </svg>
  );
}
