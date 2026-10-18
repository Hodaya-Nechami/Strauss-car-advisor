#!/usr/bin/env node
/**
 * מוריד תמונה לכל רכב בקטלוג מוויקישיתוף (Wikimedia Commons), עם פרטי הצלם והרישיון.
 *
 * הפעלה מתיקיית הפרויקט:  npm run cars:images      (או עם --force כדי להוריד מחדש)
 *
 * - התמונות נשמרות ב-apps/web/public/cars/<מזהה>.jpg, ופרטי הקרדיט ב-apps/web/app/car-images.json.
 * - שומרים רק תמונות ברישיון חופשי (CC או נחלת הכלל), ומציגים קרדיט לצלם, כמו שהרישיון דורש.
 * - בחיבור עם נטפרי, תמונה חדשה מוחלפת קודם בתמונת פסיפס קטנה ("התמונה נשלחה לנטפרי לבדיקה").
 *   הסקריפט מזהה את זה לפי הגודל, לא שומר את הפסיפס, ומדווח. מריצים שוב אחרי שנטפרי מאשר.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CATALOG = join(ROOT, "config", "catalog.json");
const OUT_DIR = join(ROOT, "apps", "web", "public", "cars");
const MANIFEST = join(ROOT, "apps", "web", "app", "car-images.json");
const FORCE = process.argv.includes("--force");
const HEADERS = { "User-Agent": "StraussCarAdvisor/0.1 (hackathon demo; https://github.com/HodayaFridland/Strauss-car-advisor)" };

/** ערך ויקיפדיה באנגלית לכל רכב. התמונה הראשית של הערך היא בדרך כלל הדור הנוכחי. */
const WIKI_TITLES = {
  "CAR-01": "Kia Picanto",
  "CAR-02": "Toyota Yaris Cross",
  "CAR-03": "BYD Dolphin",
  "CAR-04": "SEAT León",
  "CAR-05": "Kia Niro",
  "CAR-06": "MG4 EV",
  "CAR-07": "Toyota Corolla (E210)",
  "CAR-08": "Hyundai Kona",
  "CAR-09": "Toyota Corolla Cross",
  "CAR-10": "BYD Atto 3",
  "CAR-11": "Kia EV3",
  "CAR-12": "Hyundai Tucson",
  "CAR-13": "Mazda3",
  "CAR-14": "Tesla Model 3",
  "CAR-15": "Škoda Octavia",
  "CAR-16": "Kia Sportage",
  "CAR-17": "BYD Seal",
  "CAR-18": "Toyota RAV4",
  "CAR-19": "Kia Carnival",
  "CAR-20": "Hyundai Santa Fe",
};

const FREE_LICENSE = /^(cc[ -]by|cc0|cc-zero|public domain|pd)/i;

async function getJson(url) {
  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.json();
}

/** התמונה הראשית של ערך בוויקיפדיה: כתובת בגודל מתאים ושם הקובץ */
async function pageImage(title) {
  const url =
    "https://en.wikipedia.org/w/api.php?action=query&format=json&redirects=1&prop=pageimages" +
    `&piprop=thumbnail%7Cname&pithumbsize=960&titles=${encodeURIComponent(title)}`;
  const data = await getJson(url);
  const page = Object.values(data.query?.pages ?? {})[0];
  if (!page?.thumbnail?.source || !page.pageimage) return null;
  return { thumb: page.thumbnail.source.split("?")[0], file: page.pageimage, title: page.title };
}

const stripHtml = (s) => String(s ?? "").replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();

/** פרטי הרישיון והצלם מוויקישיתוף. null אם הקובץ לא בוויקישיתוף (למשל שימוש הוגן). */
async function commonsInfo(file) {
  const url =
    "https://commons.wikimedia.org/w/api.php?action=query&format=json&prop=imageinfo" +
    `&iiprop=extmetadata%7Curl&titles=${encodeURIComponent(`File:${file}`)}`;
  const data = await getJson(url);
  const page = Object.values(data.query?.pages ?? {})[0];
  const info = page?.imageinfo?.[0];
  if (!info) return null;
  const meta = info.extmetadata ?? {};
  return {
    license: stripHtml(meta.LicenseShortName?.value),
    licenseUrl: stripHtml(meta.LicenseUrl?.value) || undefined,
    author: stripHtml(meta.Artist?.value) || "לא ידוע",
    source: info.descriptionurl,
  };
}

/** רוחב וגובה של JPEG או PNG מתוך הבתים */
function imageSize(buf) {
  if (buf[0] === 0x89 && buf[1] === 0x50) return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20), type: "png" };
  if (buf[0] !== 0xff || buf[1] !== 0xd8) return null;
  let i = 2;
  while (i < buf.length) {
    if (buf[i] !== 0xff) return null;
    const marker = buf[i + 1];
    const len = buf.readUInt16BE(i + 2);
    if (marker >= 0xc0 && marker <= 0xc3) return { h: buf.readUInt16BE(i + 5), w: buf.readUInt16BE(i + 7), type: "jpeg" };
    i += 2 + len;
  }
  return null;
}

/**
 * תמונת הבדיקה של נטפרי היא פסיפס של ריבועים אחידים, ולכן היא נדחסת מאוד:
 * בערך 0.02 בתים לפיקסל, לעומת יותר מ-0.08 בצילום אמיתי.
 */
const looksLikeFilterPlaceholder = (bytes, size) => bytes / (size.w * size.h) < 0.05;

async function main() {
  const catalog = JSON.parse(readFileSync(CATALOG, "utf-8"));
  const manifest = existsSync(MANIFEST) ? JSON.parse(readFileSync(MANIFEST, "utf-8")) : {};
  mkdirSync(OUT_DIR, { recursive: true });
  const report = { saved: [], kept: [], pending: [], failed: [] };

  for (const car of catalog) {
    const target = join(OUT_DIR, `${car.id}.jpg`);
    if (!FORCE && manifest[car.id] && existsSync(target)) {
      report.kept.push(car.id);
      continue;
    }
    const title = WIKI_TITLES[car.id];
    try {
      if (!title) throw new Error("אין ערך ויקיפדיה ברשימה");
      const image = await pageImage(title);
      if (!image) throw new Error(`לערך "${title}" אין תמונה ראשית`);
      const info = await commonsInfo(image.file);
      if (!info) throw new Error("התמונה לא בוויקישיתוף");
      if (!FREE_LICENSE.test(info.license)) throw new Error(`רישיון לא חופשי: ${info.license}`);

      const res = await fetch(image.thumb, { headers: HEADERS });
      if (!res.ok) throw new Error(`הורדה נכשלה: HTTP ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      const size = imageSize(buf);
      if (!size) throw new Error("הקובץ שהתקבל הוא לא תמונה");
      if (looksLikeFilterPlaceholder(buf.length, size)) {
        report.pending.push(car.id);
        continue;
      }
      if (size.type !== "jpeg") throw new Error("התקבלה תמונה שאינה JPEG");
      writeFileSync(target, buf);
      manifest[car.id] = {
        src: `/cars/${car.id}.jpg`,
        width: size.w,
        height: size.h,
        wikiTitle: image.title,
        author: info.author,
        license: info.license,
        ...(info.licenseUrl ? { licenseUrl: info.licenseUrl } : {}),
        source: info.source,
      };
      report.saved.push(car.id);
    } catch (err) {
      report.failed.push(`${car.id} ${car.model}: ${err.message}`);
    }
  }

  const sorted = Object.fromEntries(Object.keys(manifest).sort().map((k) => [k, manifest[k]]));
  writeFileSync(MANIFEST, `${JSON.stringify(sorted, null, 2)}\n`);

  console.log(`נשמרו עכשיו: ${report.saved.length ? report.saved.join(", ") : "אין"}`);
  console.log(`כבר היו קודם: ${report.kept.length}`);
  if (report.pending.length) {
    console.log(`ממתינות לבדיקה של נטפרי (${report.pending.length}): ${report.pending.join(", ")}`);
    console.log("  הסקריפט שלח אותן לבדיקה. מריצים אותו שוב מאוחר יותר, והתמונות שאושרו יורדו.");
  }
  if (report.failed.length) {
    console.log("נכשלו:");
    for (const line of report.failed) console.log(`  ${line}`);
  }
  console.log(`בסך הכול יש תמונות ל-${Object.keys(sorted).length} מתוך ${catalog.length} רכבים.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
