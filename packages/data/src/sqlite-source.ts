/**
 * מימוש DataSource (packages/agent/src/ports.ts) מעל ה-SQLite שה-import (N3) בונה.
 */
import Database from "better-sqlite3";
import type { DataSource, ValueOfUseKey, ValueOfUseRow } from "@strauss/agent";
import { resolveDbPath } from "./paths";

const COLUMNS = `
  taxYear, registrationYear, vehicleTypeCode, manufacturerCode, manufacturer,
  modelCode, modelDescription, commercialName, drive, listPrice, valueOfUse
`;

const DEFAULT_SEARCH_LIMIT = 20;

export class SqliteDataSource implements DataSource {
  private readonly db: Database.Database;

  constructor(dbPath: string = resolveDbPath()) {
    this.db = new Database(dbPath, { readonly: true, fileMustExist: true });
  }

  async lookupValueOfUse(key: ValueOfUseKey): Promise<ValueOfUseRow[]> {
    const conditions = [
      "registrationYear = @registrationYear",
      "manufacturerCode = @manufacturerCode",
      "modelCode = @modelCode",
    ];
    const params: Record<string, unknown> = {
      registrationYear: key.registrationYear,
      manufacturerCode: key.manufacturerCode,
      modelCode: key.modelCode,
    };
    if (key.vehicleTypeCode !== undefined) {
      conditions.push("vehicleTypeCode = @vehicleTypeCode");
      params.vehicleTypeCode = key.vehicleTypeCode;
    }
    const rows = this.db
      .prepare(`SELECT ${COLUMNS} FROM value_of_use WHERE ${conditions.join(" AND ")}`)
      .all(params) as ValueOfUseRow[];
    return rows;
  }

  async searchCars(text: string, registrationYear?: number, limit = DEFAULT_SEARCH_LIMIT): Promise<ValueOfUseRow[]> {
    const conditions = ["(commercialName LIKE @text OR manufacturer LIKE @text)"];
    const params: Record<string, unknown> = { text: `%${text.trim()}%`, limit };
    if (registrationYear !== undefined) {
      conditions.push("registrationYear = @registrationYear");
      params.registrationYear = registrationYear;
    }
    const rows = this.db
      .prepare(
        `SELECT ${COLUMNS} FROM value_of_use
         WHERE ${conditions.join(" AND ")}
         ORDER BY registrationYear DESC, commercialName
         LIMIT @limit`
      )
      .all(params) as ValueOfUseRow[];
    return rows;
  }

  close(): void {
    this.db.close();
  }
}
