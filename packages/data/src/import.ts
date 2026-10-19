/**
 * מייבא את קובץ רשות המסים (data/source/value-of-use-2026.csv, מקודד cp1255)
 * ל-SQLite: מנקה רווחים משדות, בונה אינדקס על המפתח מ-rules.json ומפיק דוח כפילויות.
 *
 * הרצה: npm run import -w packages/data
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import iconv from "iconv-lite";
import Database from "better-sqlite3";
import { resolveDbPath } from "./paths";

interface Rules {
  valueOfUse: {
    key: string[];
    driveField: Record<string, string>;
  };
}

const CONFIG_DIR = process.env.CONFIG_DIR ?? resolve(process.cwd(), "..", "..", "config");
const CSV_PATH =
  process.env.CSV_PATH ?? resolve(process.cwd(), "..", "..", "data", "source", "value-of-use-2026.csv");
const DB_PATH = resolveDbPath();
const REPORT_PATH = process.env.REPORT_PATH ?? resolve(process.cwd(), ".data", "duplicate-report.json");

// סדר העמודות בקובץ המקור (ראה data/source/value-of-use-2026.csv, שורה 1)
const COLUMNS = [
  "taxYear",
  "registrationYear",
  "vehicleTypeCode",
  "manufacturerCode",
  "manufacturer",
  "modelCode",
  "modelDescription",
  "fuelType",
  "commercialName",
  "isAutomatic",
  "driveCode",
  "greenScore",
  "pollutionGrade",
  "engineVolume",
  "weight",
  "effectiveDate",
  "listPrice",
  "adjustedPrice",
  "valueOfUse",
] as const;

type Row = Record<(typeof COLUMNS)[number], string>;

function loadRules(): Rules {
  return JSON.parse(readFileSync(resolve(CONFIG_DIR, "rules.json"), "utf-8")) as Rules;
}

/**
 * השדה הוא לא CSV תקני: המרכאות בטקסט (כמו ב"ארה"ב") הן גרשיים עבריים,
 * לא תיחום מחרוזת. לכן פיצול פשוט לפי פסיק, בלי פענוח מרכאות.
 */
function parseLine(line: string): Row {
  const fields = line.split(",");
  const row = {} as Row;
  COLUMNS.forEach((name, i) => {
    row[name] = (fields[i] ?? "").trim();
  });
  return row;
}

function readRows(): Row[] {
  const raw = readFileSync(CSV_PATH);
  const text = iconv.decode(raw, "windows-1255");
  const lines = text.split("\r\n").filter((line) => line.trim().length > 0);
  const [, ...dataLines] = lines; // שורה 0 = כותרת
  return dataLines.map(parseLine);
}

function openDb(): Database.Database {
  mkdirSync(dirname(DB_PATH), { recursive: true });
  const db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.exec(`
    DROP TABLE IF EXISTS value_of_use;
    CREATE TABLE value_of_use (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      taxYear INTEGER NOT NULL,
      registrationYear INTEGER NOT NULL,
      vehicleTypeCode TEXT NOT NULL,
      manufacturerCode TEXT NOT NULL,
      manufacturer TEXT NOT NULL,
      modelCode TEXT NOT NULL,
      modelDescription TEXT NOT NULL,
      fuelType TEXT NOT NULL,
      commercialName TEXT NOT NULL,
      isAutomatic INTEGER NOT NULL,
      driveCode TEXT NOT NULL,
      drive TEXT NOT NULL,
      greenScore TEXT NOT NULL,
      pollutionGrade TEXT NOT NULL,
      engineVolume INTEGER NOT NULL,
      weight INTEGER NOT NULL,
      effectiveDate TEXT NOT NULL,
      listPrice INTEGER NOT NULL,
      adjustedPrice INTEGER NOT NULL,
      valueOfUse INTEGER NOT NULL
    );
    CREATE INDEX idx_value_of_use_key
      ON value_of_use (taxYear, registrationYear, vehicleTypeCode, manufacturerCode, modelCode);
  `);
  return db;
}

function insertRows(db: Database.Database, rows: Row[], driveField: Record<string, string>): void {
  const insert = db.prepare(`
    INSERT INTO value_of_use (
      taxYear, registrationYear, vehicleTypeCode, manufacturerCode, manufacturer,
      modelCode, modelDescription, fuelType, commercialName, isAutomatic,
      driveCode, drive, greenScore, pollutionGrade, engineVolume, weight,
      effectiveDate, listPrice, adjustedPrice, valueOfUse
    ) VALUES (
      @taxYear, @registrationYear, @vehicleTypeCode, @manufacturerCode, @manufacturer,
      @modelCode, @modelDescription, @fuelType, @commercialName, @isAutomatic,
      @driveCode, @drive, @greenScore, @pollutionGrade, @engineVolume, @weight,
      @effectiveDate, @listPrice, @adjustedPrice, @valueOfUse
    )
  `);
  const insertAll = db.transaction((all: Row[]) => {
    for (const r of all) {
      const drive = driveField[r.driveCode];
      if (!drive) {
        throw new Error(`קוד הנעה לא מוכר: "${r.driveCode}" (${r.manufacturer} ${r.commercialName})`);
      }
      insert.run({
        taxYear: Number(r.taxYear),
        registrationYear: Number(r.registrationYear),
        vehicleTypeCode: r.vehicleTypeCode,
        manufacturerCode: r.manufacturerCode,
        manufacturer: r.manufacturer,
        modelCode: r.modelCode,
        modelDescription: r.modelDescription,
        fuelType: r.fuelType,
        commercialName: r.commercialName,
        isAutomatic: Number(r.isAutomatic),
        driveCode: r.driveCode,
        drive,
        greenScore: r.greenScore,
        pollutionGrade: r.pollutionGrade,
        engineVolume: Number(r.engineVolume),
        weight: Number(r.weight),
        effectiveDate: r.effectiveDate,
        listPrice: Number(r.listPrice),
        adjustedPrice: Number(r.adjustedPrice),
        valueOfUse: Number(r.valueOfUse),
      });
    }
  });
  insertAll(rows);
}

/** מפתח לפי rules.valueOfUse.key: שנת מס, שנת רישום, קוד סוג רכב, קוד תוצר, קוד דגם */
function findDuplicates(db: Database.Database): { key: string; count: number }[] {
  return db
    .prepare(
      `
      SELECT
        taxYear || '|' || registrationYear || '|' || vehicleTypeCode || '|' || manufacturerCode || '|' || modelCode AS key,
        COUNT(*) AS count
      FROM value_of_use
      GROUP BY taxYear, registrationYear, vehicleTypeCode, manufacturerCode, modelCode
      HAVING COUNT(*) > 1
      ORDER BY count DESC
    `
    )
    .all() as { key: string; count: number }[];
}

function main(): void {
  const rules = loadRules();
  const rows = readRows();
  console.log(`נקראו ${rows.length} שורות מ-${CSV_PATH}`);

  const db = openDb();
  insertRows(db, rows, rules.valueOfUse.driveField);

  const total = (db.prepare("SELECT COUNT(*) AS n FROM value_of_use").get() as { n: number }).n;
  const duplicates = findDuplicates(db);
  mkdirSync(dirname(REPORT_PATH), { recursive: true });
  const report = {
    generatedAt: new Date().toISOString(),
    totalRows: total,
    duplicateKeyCount: duplicates.length,
    duplicates,
  };
  writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2), "utf-8");

  console.log(`יובאו ${total} שורות ל-${DB_PATH}`);
  console.log(`נמצאו ${duplicates.length} מפתחות עם כפילות. דוח מלא: ${REPORT_PATH}`);

  const sample = db
    .prepare(
      `SELECT valueOfUse FROM value_of_use
       WHERE registrationYear = 2025 AND manufacturerCode = '01014' AND modelCode = '00003' AND vehicleTypeCode = '1'`
    )
    .get() as { valueOfUse: number } | undefined;
  console.log(`בדיקת היגיון (ATTO 3, 2025): שווי שימוש = ${sample?.valueOfUse ?? "לא נמצא"}`);

  db.close();
}

main();
