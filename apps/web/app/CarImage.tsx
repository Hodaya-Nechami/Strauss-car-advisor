/**
 * תמונה של רכב מהקטלוג, עם קרדיט לצלם כמו שהרישיון דורש.
 * כשאין תמונה (רכב שלא בקטלוג, או תמונה שעוד ממתינה לבדיקה של נטפרי) מוצג ציור לפי סוג המרכב.
 */
import { BODY_TYPES, carColor, carImages, type BodyType } from "./cars";

interface Shape {
  left: number;
  right: number;
  belt: number;
  bottom: number;
  roofFrom: number;
  roofTo: number;
  roofY: number;
  front: number;
  rear: number;
  wheelR: number;
  wheels: [number, number];
}

const SHAPES: Record<BodyType, Shape> = {
  city: { left: 34, right: 166, belt: 54, bottom: 80, roofFrom: 62, roofTo: 132, roofY: 26, front: 26, rear: 10, wheelR: 13, wheels: [62, 138] },
  hatch: { left: 18, right: 182, belt: 56, bottom: 80, roofFrom: 56, roofTo: 140, roofY: 28, front: 32, rear: 14, wheelR: 14, wheels: [52, 148] },
  sedan: { left: 12, right: 188, belt: 58, bottom: 80, roofFrom: 64, roofTo: 128, roofY: 30, front: 34, rear: 28, wheelR: 14, wheels: [48, 152] },
  suv: { left: 14, right: 186, belt: 52, bottom: 82, roofFrom: 50, roofTo: 152, roofY: 20, front: 26, rear: 10, wheelR: 16, wheels: [50, 150] },
  van: { left: 12, right: 188, belt: 50, bottom: 82, roofFrom: 30, roofTo: 168, roofY: 16, front: 30, rear: 8, wheelR: 15, wheels: [46, 154] },
};

export function CarIllustration({ body = "hatch", color = "#6d4aff" }: { body?: BodyType; color?: string }) {
  const s = SHAPES[body];
  // המכונית פונה שמאלה, לכיוון הקריאה בעברית
  const cabin = `M${s.roofFrom - s.front} ${s.belt} L${s.roofFrom} ${s.roofY} L${s.roofTo} ${s.roofY} L${s.roofTo + s.rear} ${s.belt} Z`;
  const glass = `M${s.roofFrom - s.front + 9} ${s.belt - 3} L${s.roofFrom + 3} ${s.roofY + 6} L${s.roofTo - 3} ${s.roofY + 6} L${s.roofTo + s.rear - 7} ${s.belt - 3} Z`;
  const pillar = (s.roofFrom + s.roofTo) / 2;
  return (
    <svg viewBox="0 0 200 100" className="car-illustration" aria-hidden="true">
      <ellipse cx="100" cy="94" rx="86" ry="4.5" fill="rgba(20,10,60,0.12)" />
      <path d={cabin} fill={color} stroke={color} strokeWidth="10" strokeLinejoin="round" />
      <path d={glass} fill="#e8f1ff" stroke="#e8f1ff" strokeWidth="3" strokeLinejoin="round" />
      <rect x={pillar - 2.5} y={s.roofY + 4} width="5" height={s.belt - s.roofY - 6} fill={color} />
      <rect x={s.left} y={s.belt} width={s.right - s.left} height={s.bottom - s.belt} rx="13" fill={color} />
      <rect x={s.left + 4} y={s.belt + 8} width="12" height="7" rx="3" fill="#ffd96a" />
      <rect x={s.right - 12} y={s.belt + 8} width="8" height="7" rx="3" fill="#ff7a7a" />
      <path d={`M${s.left + 22} ${s.belt + 12} L${s.right - 22} ${s.belt + 12}`} stroke="#ffffff" strokeWidth="2" opacity="0.35" />
      {s.wheels.map((cx) => (
        <g key={cx}>
          <circle cx={cx} cy={s.bottom} r={s.wheelR} fill="#2b2d42" />
          <circle cx={cx} cy={s.bottom} r={s.wheelR * 0.45} fill="#d7d9e6" />
        </g>
      ))}
    </svg>
  );
}

/** ציור לוויתור על רכב: ארנק עם מטבע של אחזקת רכב */
export function WaiverArt() {
  return (
    <svg viewBox="0 0 200 100" className="car-illustration" aria-hidden="true">
      <ellipse cx="100" cy="94" rx="70" ry="4.5" fill="rgba(20,10,60,0.12)" />
      <rect x="48" y="30" width="104" height="58" rx="12" fill="#f5b84b" />
      <path d="M48 44 Q100 22 152 44 L152 52 L48 52 Z" fill="#e39a22" />
      <rect x="118" y="52" width="40" height="22" rx="8" fill="#e39a22" />
      <circle cx="133" cy="63" r="4" fill="#fff3d6" />
      <g transform="translate(78 22)">
        <circle r="17" fill="#f7c948" stroke="#d99a00" strokeWidth="2" />
        <text y="6.5" textAnchor="middle" fontSize="19" fontWeight="700" fill="#8a5a00" fontFamily="Arial">
          ₪
        </text>
      </g>
    </svg>
  );
}

export function CarImage({
  carId,
  label,
  kind = "car",
  credit = true,
}: {
  carId?: string;
  label: string;
  kind?: "car" | "waiver" | "none";
  credit?: boolean;
}) {
  if (kind === "waiver") {
    return (
      <figure className="car-figure">
        <div className="car-frame illustration">
          <WaiverArt />
        </div>
      </figure>
    );
  }
  const photo = carId ? carImages[carId] : undefined;
  return (
    <figure className="car-figure">
      <div className={`car-frame${photo ? "" : " illustration"}`}>
        {photo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={photo.src} alt={label} width={photo.width} height={photo.height} loading="lazy" />
        ) : (
          <CarIllustration body={carId ? BODY_TYPES[carId] : "hatch"} color={carColor(carId)} />
        )}
      </div>
      {photo && credit && (
        <figcaption className="credit">
          <a href={photo.source} target="_blank" rel="noopener noreferrer">
            צילום: {photo.author} · {photo.license}
          </a>
        </figcaption>
      )}
    </figure>
  );
}
