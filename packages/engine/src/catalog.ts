import type { CarInSituation, CatalogCar } from "./types";

/** הופך רכב מהקטלוג לרכב בתוך מצב (היום או חלופה) */
export function carFromCatalog(c: CatalogCar): CarInSituation {
  return {
    label: c.model,
    catalogGroup: c.group,
    drive: c.drive,
    valueOfUse: c.valueOfUse,
    monthlyCost: c.monthlyCost,
    registrationYear: c.registrationYear,
    catalogId: c.id,
  };
}

/** חיפוש רכב בקטלוג לפי מזהה או לפי שם דגם (לא תלוי באותיות גדולות) */
export function findCatalogCar(catalog: CatalogCar[], idOrModel: string): CatalogCar | undefined {
  const q = idOrModel.trim().toUpperCase();
  return catalog.find((c) => c.id.toUpperCase() === q || c.model.toUpperCase() === q);
}
