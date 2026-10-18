/**
 * מימושים זמניים בזיכרון, לפיתוח ולבדיקות.
 * בגרסה האמיתית נחמי מחליפה אותם ב-SQLite.
 */
import type { CatalogCar } from "@strauss/engine";
import type { AuditLog, DataSource, RepQuestion, RepQueue, ValueOfUseKey, ValueOfUseRow } from "./ports";

/** מקור נתונים שמכיר רק את רכבי הקטלוג. מספיק כדי לפתח עד שמאגר רשות המסים מחובר. */
export class CatalogDataSource implements DataSource {
  private rows: ValueOfUseRow[];

  constructor(catalog: CatalogCar[], taxYear = 2026) {
    this.rows = catalog.map((c) => ({
      taxYear,
      registrationYear: c.registrationYear,
      vehicleTypeCode: "1",
      manufacturerCode: c.manufacturerCode,
      manufacturer: c.manufacturer,
      modelCode: c.modelCode,
      modelDescription: c.modelDescription,
      commercialName: c.model,
      drive: c.drive,
      listPrice: c.listPrice,
      valueOfUse: c.valueOfUse,
    }));
  }

  async lookupValueOfUse(key: ValueOfUseKey): Promise<ValueOfUseRow[]> {
    return this.rows.filter(
      (r) =>
        r.registrationYear === key.registrationYear &&
        r.manufacturerCode === key.manufacturerCode &&
        r.modelCode === key.modelCode &&
        (key.vehicleTypeCode === undefined || r.vehicleTypeCode === key.vehicleTypeCode),
    );
  }

  async searchCars(text: string, registrationYear?: number, limit = 10): Promise<ValueOfUseRow[]> {
    const q = text.trim().toUpperCase();
    return this.rows
      .filter((r) => (r.commercialName.toUpperCase().includes(q) || r.manufacturer.includes(text.trim())))
      .filter((r) => registrationYear === undefined || r.registrationYear === registrationYear)
      .slice(0, limit);
  }
}

export class MemoryRepQueue implements RepQueue {
  readonly questions: (RepQuestion & { ticketId: string })[] = [];
  async ask(q: RepQuestion) {
    const ticketId = `Q-${this.questions.length + 1}`;
    this.questions.push({ ...q, ticketId });
    return { ticketId };
  }
}

export function memoryAudit(): { log: AuditLog; entries: Parameters<AuditLog>[0][] } {
  const entries: Parameters<AuditLog>[0][] = [];
  return { log: (e) => entries.push(e), entries };
}
