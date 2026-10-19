/**
 * אייקונים בקו אחיד, במקום אימוג'י שנראים אחרת בכל מכשיר.
 * מצוירים ב-SVG עם currentColor, כך שהם מקבלים את צבע הטקסט שסביבם.
 */
import type { ReactNode } from "react";

const PATHS = {
  trophy: (
    <>
      <path d="M8 4h8v5a4 4 0 0 1-8 0V4Z" />
      <path d="M8 6H5.5a2.5 2.5 0 0 0 2.5 4M16 6h2.5a2.5 2.5 0 0 1-2.5 4" />
      <path d="M12 13v4M8.5 20h7M9.5 17h5" />
    </>
  ),
  bolt: <path d="M13 2.5 4.5 14h6.5l-1 7.5L18.5 10H12l1-7.5Z" />,
  key: (
    <>
      <circle cx="7.5" cy="15.5" r="3.5" />
      <path d="m10 13 9-9M15.5 7.5l2 2M13.5 9.5l2 2" />
    </>
  ),
  family: (
    <>
      <circle cx="9" cy="8" r="3" />
      <path d="M3.5 20a5.5 5.5 0 0 1 11 0" />
      <circle cx="17" cy="9.5" r="2.3" />
      <path d="M15.6 14.4A4.5 4.5 0 0 1 21 19" />
    </>
  ),
  target: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="12" cy="12" r="4.5" />
      <circle cx="12" cy="12" r="1" />
    </>
  ),
  doc: (
    <>
      <path d="M7 3h7l5 5v13H7V3Z" />
      <path d="M14 3v5h5M10 13h6M10 17h6" />
    </>
  ),
  car: (
    <>
      <path d="m5 12 1.8-4.6A2 2 0 0 1 8.7 6h6.6a2 2 0 0 1 1.9 1.4L19 12" />
      <rect x="3" y="12" width="18" height="5.5" rx="1.8" />
      <path d="M6 17.5V19M18 17.5V19M6.5 14.7h1.5M16 14.7h1.5" />
    </>
  ),
  person: (
    <>
      <circle cx="12" cy="8" r="3.8" />
      <path d="M4.5 20.5a7.5 7.5 0 0 1 15 0" />
    </>
  ),
  upload: <path d="M12 15.5V4M7 8.5 12 4l5 4.5M5 15v4.5h14V15" />,
  play: <path d="M8 5.5v13l10.5-6.5L8 5.5Z" />,
  check: <path d="m5 12.5 4.5 4.5L19 7.5" />,
  lock: (
    <>
      <rect x="5" y="10.5" width="14" height="10" rx="2" />
      <path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" />
    </>
  ),
  calc: (
    <>
      <rect x="5" y="3" width="14" height="18" rx="2.2" />
      <path d="M8.5 7h7M8.5 11.5h.01M12 11.5h.01M15.5 11.5h.01M8.5 15h.01M12 15h.01M15.5 15h.01M8.5 18h.01M12 18h3.5" />
    </>
  ),
  refresh: (
    <>
      <path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3" />
      <path d="M19.5 4.5v4.5H15" />
    </>
  ),
  list: (
    <>
      <rect x="5.5" y="4.5" width="13" height="16.5" rx="2" />
      <path d="M9 3.5h6v2.5H9zM9 11h6M9 14.5h6M9 18h3.5" />
    </>
  ),
  chart: <path d="M4 20h16M7 16.5V11M12 16.5V6.5M17 16.5v-3.5" />,
  sparkle: <path d="M12 3.5 13.7 9l5.3 1.7-5.3 1.8L12 18l-1.7-5.5L5 10.7 10.3 9 12 3.5Z" />,
  plus: <path d="M12 5v14M5 12h14" />,
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  close: <path d="m6 6 12 12M18 6 6 18" />,
  crown: <path d="m3.5 8.5 4.2 3.8L12 5.5l4.3 6.8 4.2-3.8-2 10.5H5.5l-2-10.5Z" />,
  leaf: (
    <>
      <path d="M5 19c0-8 5.5-14 15-14 0 9.5-6 15-14 15" />
      <path d="m5 19 8.5-8.5" />
    </>
  ),
  plug: <path d="M9 3v5M15 3v5M7 8h10v2.5a5 5 0 0 1-10 0V8ZM12 15.5V21" />,
  fuel: (
    <>
      <rect x="4" y="4" width="10" height="16" rx="1.6" />
      <path d="M4 10h10M14 8h1.6L19 11.5v6.2a1.5 1.5 0 0 1-3 0V14h-2" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </>
  ),
  shield: (
    <>
      <path d="M12 3.2 19.5 6v5.6c0 4.6-3.2 7.8-7.5 9.2-4.3-1.4-7.5-4.6-7.5-9.2V6L12 3.2Z" />
      <path d="m8.8 12.2 2.3 2.3 4.3-4.6" />
    </>
  ),
  alert: <path d="M12 4 21 19.5H3L12 4ZM12 10v4.5M12 17h.01" />,
  dot: <circle cx="12" cy="12" r="3.5" />,
  chat: <path d="M4.5 5h15v10.5H10L5.5 19.5V15.5H4.5V5Z" />,
  arrowLeft: <path d="M19 12H5M11 6l-6 6 6 6" />,
  edit: <path d="M4.5 19.5 5.3 15 15.6 4.7a2 2 0 0 1 2.8 0l.9.9a2 2 0 0 1 0 2.8L9 18.7l-4.5.8ZM13.5 6.8l3.7 3.7" />,
} satisfies Record<string, ReactNode>;

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 20, className }: { name: IconName; size?: number; className?: string }) {
  return (
    <svg
      className={`icon${className ? ` ${className}` : ""}`}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {PATHS[name]}
    </svg>
  );
}
