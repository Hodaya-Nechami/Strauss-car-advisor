/**
 * מערכת פנימית: כשהכניסה עם Google מוגדרת, כל מסך וכל API דורשים כניסה (auth.ts).
 * מי שלא מחובר מגיע למסך הכניסה, ו-API מחזיר 401 עם הודעה בעברית במקום דף HTML.
 * בלי הגדרת Google הכניסה כבויה, והכול פתוח כמו קודם.
 */
import { NextResponse, type NextFetchEvent, type NextRequest } from "next/server";
import { auth, googleLoginEnabled } from "@/auth";

const requireLogin = auth((req) => {
  if (req.auth) return NextResponse.next();
  if (req.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "צריך להתחבר מחדש. רעננו את הדף." }, { status: 401 });
  }
  const login = new URL("/login", req.url);
  login.searchParams.set("callbackUrl", req.nextUrl.pathname + req.nextUrl.search);
  return NextResponse.redirect(login);
});

export default function middleware(req: NextRequest, event: NextFetchEvent) {
  if (!googleLoginEnabled()) return NextResponse.next();
  return requireLogin(req, event as never);
}

export const config = {
  // Node ולא Edge, כדי שהגדרות הסביבה ייקראו בזמן ריצה ולא ייקבעו בזמן הבנייה
  runtime: "nodejs",
  // בלי מסך הכניסה, הכניסה עצמה, קבצי Next ותמונות ציבוריות.
  // בלי העלאת התלוש: middleware מעתיק את גוף הבקשה לפני שהוא מגיע לנתיב, ובענן ההעתקה של קובץ נכשלה
  // ב-500 שאינו JSON, מחוץ לקוד שלנו. הנתיב בודק את הכניסה בעצמו (app/api/payslip/route.ts).
  matcher: ["/((?!login|api/auth|api/payslip|_next/static|_next/image|favicon.ico|icon.svg|cars/|samples/).*)"],
};
