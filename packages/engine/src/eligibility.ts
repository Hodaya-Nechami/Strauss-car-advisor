import type { Rules } from "./rules";
import type { Eligibility, EmployeeProfile, Occupation, Situation } from "./types";

/**
 * בדיקת זכאות לחלופה. קובעת רק לפי הכללים והטבלאות.
 * כשחסר מידע מחזירה needs_info עם רשימת החוסרים. אף פעם לא מנחשת.
 */
export function checkEligibility(
  profile: EmployeeProfile,
  alternative: Situation,
  occupations: Occupation[],
  rules: Rules,
): Eligibility {
  const occupation = profile.occupation ? occupations.find((o) => o.name === profile.occupation) : undefined;

  if (occupation && occupation.group !== profile.group) {
    return {
      status: "needs_info",
      reason: `קבוצת הזכאות שנמסרה (${profile.group}) שונה מהקבוצה של העיסוק "${occupation.name}" (${occupation.group})`,
      missing: ["אישור קבוצת הזכאות מהנציג"],
    };
  }

  if (!rules.groupOrder.includes(profile.group)) {
    return { status: "needs_info", reason: `קבוצת זכאות לא מוכרת: ${profile.group}`, missing: ["קבוצת זכאות (א-ד)"] };
  }

  if (alternative.kind === "none") {
    return { status: "eligible", reason: "ללא רכב", missing: [] };
  }

  if (alternative.kind === "waiver") {
    if (!profile.occupation) {
      return { status: "needs_info", reason: "הוויתור תלוי בעיסוק", missing: ["עיסוק"] };
    }
    if (!occupation) {
      return {
        status: "needs_info",
        reason: `העיסוק "${profile.occupation}" לא מופיע בטבלת העיסוקים`,
        missing: ["אישור הנציג לגבי ויתור בעיסוק הזה"],
      };
    }
    if (occupation.carMandatory) {
      return { status: "not_eligible", reason: "בעיסוק שלך הרכב חובה, ולכן אין אפשרות לוותר עליו", missing: [] };
    }
    if (!occupation.waiverAllowed) {
      return { status: "not_eligible", reason: "העיסוק שלך לא מאפשר ויתור על הרכב", missing: [] };
    }
    return { status: "eligible", reason: "העיסוק מאפשר ויתור", missing: [] };
  }

  const car = alternative.car;
  if (car.catalogGroup === undefined) {
    return {
      status: "needs_info",
      reason: `הרכב ${car.label} לא נמצא בקטלוג החברה`,
      missing: ["אישור הנציג שהרכב זמין ובאיזו קבוצה"],
    };
  }

  if (car.catalogGroup === "משפחתי") {
    const ft = rules.familyTrack;
    if (profile.childrenUnder23 >= ft.minChildren) {
      const pct = Math.round(ft.gapSplitEmployee * 100);
      return {
        status: "eligible",
        reason: `מסלול ברוכת ילדים (${profile.childrenUnder23} ילדים); על הפער מעל התקציב - ${pct}% עובד`,
        missing: [],
      };
    }
    return {
      status: "not_eligible",
      reason: `מסלול ברוכת ילדים מיועד ל-${ft.minChildren} ילדים ומעלה עד גיל ${ft.childMaxAge}`,
      missing: [],
    };
  }

  const carIdx = rules.groupOrder.indexOf(car.catalogGroup);
  const empIdx = rules.groupOrder.indexOf(profile.group);
  if (carIdx === -1) {
    return { status: "needs_info", reason: `קבוצת רכב לא מוכרת: ${car.catalogGroup}`, missing: ["קבוצת הרכב"] };
  }
  if (carIdx <= empIdx) {
    return { status: "eligible", reason: "הרכב מהקבוצה שלך או נמוכה ממנה", missing: [] };
  }
  return {
    status: "not_eligible",
    reason: `הרכב מקבוצה ${car.catalogGroup}, גבוהה מהקבוצה שלך (${profile.group}). אפשר לבחור רק מהקבוצה שלך או נמוכה ממנה`,
    missing: [],
  };
}
