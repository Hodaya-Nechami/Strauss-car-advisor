import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CarGallery } from "../app/CarGallery";
import { CarImage } from "../app/CarImage";
import { BODY_TYPES, carImages } from "../app/cars";
import { Mascot } from "../app/Mascot";

const here = dirname(fileURLToPath(import.meta.url));
const catalog = JSON.parse(readFileSync(join(here, "..", "..", "..", "config", "catalog.json"), "utf-8")) as { id: string }[];

describe("תמונות הרכבים", () => {
  it("לכל רכב בקטלוג יש סוג מרכב לציור", () => {
    expect(catalog.every((c) => BODY_TYPES[c.id])).toBe(true);
  });

  it("כל תמונה ברשימה קיימת כקובץ, ברישיון חופשי ועם שם הצלם", () => {
    const entries = Object.entries(carImages);
    expect(entries.length).toBeGreaterThan(0);
    for (const [id, img] of entries) {
      expect(existsSync(join(here, "..", "public", img.src))).toBe(true);
      expect(img.src).toBe(`/cars/${id}.jpg`);
      expect(img.license).toMatch(/^(CC|Public domain)/i);
      expect(img.author.length).toBeGreaterThan(0);
    }
  });

  it("רכב עם תמונה: מציג אותה עם קרדיט לצלם", () => {
    const [id, img] = Object.entries(carImages)[0]!;
    const html = renderToStaticMarkup(<CarImage carId={id} label="רכב" />);
    expect(html).toContain(`src="${img.src}"`);
    expect(html).toContain(img.license);
  });

  it("רכב בלי תמונה: מציג ציור במקום תמונה שבורה", () => {
    const html = renderToStaticMarkup(<CarImage carId="CAR-99" label="רכב לא מוכר" />);
    expect(html).toContain("car-illustration");
    expect(html).not.toContain("<img");
  });

  it("ויתור על רכב: מציג ארנק עם מטבע", () => {
    const html = renderToStaticMarkup(<CarImage kind="waiver" label="ויתור" />);
    expect(html).toContain("car-illustration");
    expect(html).toContain("₪");
  });

  it("גלריה: כותרת לפי המטרה, ותגיות של קבוצה וסוג הנעה", () => {
    const html = renderToStaticMarkup(
      <CarGallery
        group={{
          purpose: "options",
          cars: [
            { id: "CAR-11", model: "EV3", manufacturer: "קיה קוריאה", group: "ג", drive: "חשמלי", registrationYear: 2025, valueOfUse: 2930 },
          ],
        }}
      />,
    );
    const text = html.replace(/<!-- -->/g, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
    expect(text).toContain("רכבים שאפשר לבחור");
    expect(text).toContain("קבוצה ג");
    expect(text).toContain("חשמלי");
    expect(text).toContain("2,930 ₪");
  });
});

describe("נטבוט, הדמות", () => {
  it("כל מצב רוח מצויר, עם המחלקה שלו לאנימציה", () => {
    for (const mood of ["idle", "thinking", "happy", "sad", "waiting"] as const) {
      const html = renderToStaticMarkup(<Mascot mood={mood} />);
      expect(html).toContain(`mascot-${mood}`);
      expect(html).toContain("<svg");
    }
  });

  it("עם כותרת הוא תמונה נגישה, ובלי כותרת הוא קישוט שקורא מסך מדלג עליו", () => {
    expect(renderToStaticMarkup(<Mascot title="נטבוט" />)).toContain('aria-label="נטבוט"');
    expect(renderToStaticMarkup(<Mascot />)).toContain('aria-hidden="true"');
  });
});
