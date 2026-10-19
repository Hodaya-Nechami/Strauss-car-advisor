/** גלריית רכבים: מה שהבוט הציע, הרכב של העובד היום, או רכב שהוא שוקל. */
import { CarImage } from "./CarImage";
import { DRIVES, shekel } from "./cars";
import { Icon } from "./Icon";
import type { CarGroup } from "./types";

const TITLES: Record<CarGroup["purpose"], string> = {
  options: "רכבים שאפשר לבחור",
  current: "הרכב שלך היום",
  interest: "הרכב שמעניין אותך",
};

export function CarGallery({ group }: { group: CarGroup }) {
  const single = group.cars.length === 1;
  return (
    <section className={`gallery${single ? " single" : ""}`} aria-label={TITLES[group.purpose]}>
      <div className="gallery-title">{TITLES[group.purpose]}</div>
      <div className="gallery-grid">
        {group.cars.map((car) => {
          const drive = DRIVES[car.drive];
          return (
            <article key={car.id} className="car-card">
              <CarImage carId={car.id} label={`${car.model}, ${car.manufacturer}`} />
              <div className="car-card-body">
                <div className="car-name">{car.model}</div>
                <div className="car-maker">
                  {car.manufacturer} · {car.registrationYear}
                </div>
                <div className="chips">
                  <span className="chip group">{car.group === "משפחתי" ? "מסלול משפחתי" : `קבוצה ${car.group}`}</span>
                  {drive && (
                    <span className={`chip drive ${drive.tone}`}>
                      <Icon name={drive.icon} size={14} /> {drive.label}
                    </span>
                  )}
                </div>
                <div className="car-vou">
                  שווי שימוש <bdi>{shekel(car.valueOfUse)}</bdi> בחודש
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
