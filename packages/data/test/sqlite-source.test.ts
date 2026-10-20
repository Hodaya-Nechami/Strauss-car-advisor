import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import { SqliteDataSource } from "../src/sqlite-source";

interface FixtureRow {
  taxYear: number;
  registrationYear: number;
  vehicleTypeCode: string;
  manufacturerCode: string;
  manufacturer: string;
  modelCode: string;
  modelDescription: string;
  commercialName: string;
  drive: string;
  listPrice: number;
  valueOfUse: number;
}

// ATTO 3 ו-TANG חולקים manufacturerCode+modelCode, ונבדלים רק ב-vehicleTypeCode -
// בדיוק המלכודת שה-README מזהיר מפניה.
const ATTO_3: FixtureRow = {
  taxYear: 2026,
  registrationYear: 2025,
  vehicleTypeCode: "1",
  manufacturerCode: "01014",
  manufacturer: "בי ווי די",
  modelCode: "00003",
  modelDescription: "SC2E-SC2E01",
  commercialName: "ATTO 3",
  drive: "חשמלי",
  listPrice: 177500,
  valueOfUse: 3130,
};

const TANG: FixtureRow = {
  ...ATTO_3,
  vehicleTypeCode: "2",
  modelDescription: "STE2-STE2",
  commercialName: "TANG",
  listPrice: 327990,
  valueOfUse: 6950,
};

const COROLLA_2024: FixtureRow = {
  taxYear: 2026,
  registrationYear: 2024,
  vehicleTypeCode: "1",
  manufacturerCode: "00050",
  manufacturer: "טויוטה",
  modelCode: "00100",
  modelDescription: "קורולה",
  commercialName: "COROLLA",
  drive: "היברידי",
  listPrice: 150000,
  valueOfUse: 2500,
};

function buildFixtureDb(path: string, rows: FixtureRow[]): void {
  const db = new Database(path);
  db.exec(`
    CREATE TABLE value_of_use (
      taxYear INTEGER NOT NULL,
      registrationYear INTEGER NOT NULL,
      vehicleTypeCode TEXT NOT NULL,
      manufacturerCode TEXT NOT NULL,
      manufacturer TEXT NOT NULL,
      modelCode TEXT NOT NULL,
      modelDescription TEXT NOT NULL,
      commercialName TEXT NOT NULL,
      drive TEXT NOT NULL,
      listPrice INTEGER NOT NULL,
      valueOfUse INTEGER NOT NULL
    );
  `);
  const insert = db.prepare(`
    INSERT INTO value_of_use (
      taxYear, registrationYear, vehicleTypeCode, manufacturerCode, manufacturer,
      modelCode, modelDescription, commercialName, drive, listPrice, valueOfUse
    ) VALUES (
      @taxYear, @registrationYear, @vehicleTypeCode, @manufacturerCode, @manufacturer,
      @modelCode, @modelDescription, @commercialName, @drive, @listPrice, @valueOfUse
    )
  `);
  for (const row of rows) insert.run(row);
  db.close();
}

describe("SqliteDataSource", () => {
  let dir: string;
  let dbPath: string;
  let source: SqliteDataSource;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "strauss-data-test-"));
    dbPath = join(dir, "test.db");
    buildFixtureDb(dbPath, [ATTO_3, TANG, COROLLA_2024]);
    source = new SqliteDataSource(dbPath);
  });

  afterEach(() => {
    source.close();
    rmSync(dir, { recursive: true, force: true });
  });

  describe("lookupValueOfUse", () => {
    it("מחזיר שורה אחת כש-vehicleTypeCode מבדיל בין ATTO 3 ל-TANG", async () => {
      const rows = await source.lookupValueOfUse({
        registrationYear: 2025,
        manufacturerCode: "01014",
        modelCode: "00003",
        vehicleTypeCode: "1",
      });
      expect(rows).toHaveLength(1);
      expect(rows[0]?.commercialName).toBe("ATTO 3");
      expect(rows[0]?.valueOfUse).toBe(3130);
    });

    it("מחזיר שתי שורות (ATTO 3 ו-TANG) בלי vehicleTypeCode", async () => {
      const rows = await source.lookupValueOfUse({
        registrationYear: 2025,
        manufacturerCode: "01014",
        modelCode: "00003",
      });
      expect(rows).toHaveLength(2);
      expect(rows.map((r) => r.commercialName).sort()).toEqual(["ATTO 3", "TANG"]);
    });

    it("מחזיר מערך ריק כשאין התאמה", async () => {
      const rows = await source.lookupValueOfUse({
        registrationYear: 1999,
        manufacturerCode: "00000",
        modelCode: "00000",
      });
      expect(rows).toEqual([]);
    });
  });

  describe("searchCars", () => {
    it("מוצא לפי שם מסחרי חלקי", async () => {
      const rows = await source.searchCars("ATTO");
      expect(rows).toHaveLength(1);
      expect(rows[0]?.commercialName).toBe("ATTO 3");
    });

    it("מוצא לפי שם תוצר", async () => {
      const rows = await source.searchCars("טויוטה");
      expect(rows).toHaveLength(1);
      expect(rows[0]?.commercialName).toBe("COROLLA");
    });

    it("מסנן לפי שנת רישום", async () => {
      const rows = await source.searchCars("בי ווי די", 2024);
      expect(rows).toEqual([]);
    });

    it("מכבד limit", async () => {
      const rows = await source.searchCars("בי ווי די", undefined, 1);
      expect(rows).toHaveLength(1);
    });
  });
});
