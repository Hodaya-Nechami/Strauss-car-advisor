"use client";

/** העובד המחובר, בתחתית תפריט הצד, עם כפתור יציאה. כשהכניסה כבויה לא מוצג כלום. */
import { signOut } from "next-auth/react";
import { useEffect, useState } from "react";
import { Icon } from "./Icon";

interface User {
  name?: string | null;
  email?: string | null;
  image?: string | null;
}

export function UserBadge() {
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    // בלי SessionProvider: קריאה אחת לשרת מספיקה, והרכיב עובד גם כשהכניסה כבויה (תשובה ריקה)
    fetch("/api/auth/session", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((s: { user?: User } | null) => setUser(s?.user ?? null))
      .catch(() => setUser(null));
  }, []);

  if (!user?.email) return null;
  const name = user.name || user.email;
  return (
    <div className="rail-user">
      {user.image ? (
        // התמונה מגיעה מ-Google. בלי referrer, כי Google חוסם לפעמים תמונות עם referrer זר.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={user.image} alt="" referrerPolicy="no-referrer" />
      ) : (
        <span className="rail-avatar" aria-hidden="true">
          {name.slice(0, 1)}
        </span>
      )}
      <div className="rail-user-text">
        <div className="rail-user-name">{name}</div>
        <div className="rail-user-mail">
          <bdi>{user.email}</bdi>
        </div>
      </div>
      <button
        type="button"
        className="icon-button"
        onClick={() => void signOut({ redirectTo: "/login" })}
        aria-label="יציאה"
        title="יציאה"
      >
        <Icon name="logout" size={18} />
      </button>
    </div>
  );
}
