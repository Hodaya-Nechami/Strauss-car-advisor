/** מידע תצוגה על רכבי הקטלוג: סוג מרכב לציור חלופי, צבע, ותוויות בעברית. */
import carImagesJson from "./car-images.json";

export type BodyType = "city" | "hatch" | "sedan" | "suv" | "van";

export interface CarImageInfo {
  src: string;
  width: number;
  height: number;
  wikiTitle: string;
  author: string;
  license: string;
  licenseUrl?: string;
  source: string;
}

/** תמונות שהורדו בסקריפט scripts/fetch-car-images.mjs */
export const carImages = carImagesJson as Record<string, CarImageInfo>;

/** סוג המרכב של כל רכב בקטלוג, לציור כשאין תמונה */
export const BODY_TYPES: Record<string, BodyType> = {
  "CAR-01": "city",
  "CAR-02": "suv",
  "CAR-03": "hatch",
  "CAR-04": "hatch",
  "CAR-05": "suv",
  "CAR-06": "hatch",
  "CAR-07": "sedan",
  "CAR-08": "suv",
  "CAR-09": "suv",
  "CAR-10": "suv",
  "CAR-11": "suv",
  "CAR-12": "suv",
  "CAR-13": "hatch",
  "CAR-14": "sedan",
  "CAR-15": "sedan",
  "CAR-16": "suv",
  "CAR-17": "sedan",
  "CAR-18": "suv",
  "CAR-19": "van",
  "CAR-20": "suv",
};

/** צבע לציור, קבוע לכל רכב */
const PALETTE = ["#6d4aff", "#ff6b8b", "#16a3a3", "#f59f2a", "#3a7bff", "#9a5cf0", "#e8505b", "#2fae6a"];

export function carColor(id: string | undefined): string {
  if (!id) return PALETTE[0]!;
  const n = [...id].reduce((sum, ch) => sum + ch.charCodeAt(0), 0);
  return PALETTE[n % PALETTE.length]!;
}

/** תווית ואייקון לכל סוג הנעה */
export const DRIVES: Record<string, { label: string; icon: string; tone: string }> = {
  "חשמלי": { label: "חשמלי", icon: "⚡", tone: "electric" },
  "פלאג-אין": { label: "פלאג-אין", icon: "🔌", tone: "plugin" },
  "היברידי": { label: "היברידי", icon: "🍃", tone: "hybrid" },
  "בנזין": { label: "בנזין", icon: "⛽", tone: "petrol" },
};

export const shekel = (n: number) => `${n.toLocaleString("en-US")} ₪`;
