"use client";

/** תנועה קטנה שמשמחת: מספרים שרצים עד הערך הסופי, וקונפטי כשהנטו עולה. נכבית למי שביקש פחות תנועה. */
import { useEffect, useState, type CSSProperties } from "react";

function prefersLessMotion(): boolean {
  return typeof window === "undefined" || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
}

/** מספר שעולה מ-0 עד הערך, עם האטה בסוף. בלי דפדפן (למשל בבדיקות) מוצג מיד הערך הסופי. */
export function useCountUp(target: number, ms = 900): number {
  const [value, setValue] = useState(() => (prefersLessMotion() ? target : 0));
  useEffect(() => {
    if (prefersLessMotion()) {
      setValue(target);
      return;
    }
    let frame = 0;
    const start = performance.now();
    const tick = (time: number) => {
      const p = Math.min(1, (time - start) / ms);
      setValue(Math.round(target * (1 - Math.pow(1 - p, 3))));
      if (p < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, ms]);
  return value;
}

const COLORS = ["#6d4aff", "#ff6b8b", "#ffc83d", "#1c9e80", "#3a7bff", "#ff9f43"];

/** פרץ קונפטי חד-פעמי מעל האלמנט שמכיל אותו */
export function Confetti({ pieces = 26 }: { pieces?: number }) {
  return (
    <span className="confetti" aria-hidden="true">
      {Array.from({ length: pieces }, (_, i) => {
        const angle = (i / pieces) * Math.PI * 2;
        const reach = 70 + ((i * 37) % 60);
        const style = {
          "--x": `${Math.cos(angle) * reach * 1.6}px`,
          "--y": `${Math.sin(angle) * reach - 40}px`,
          "--r": `${(i * 73) % 360}deg`,
          "--d": `${(i % 5) * 40}ms`,
          background: COLORS[i % COLORS.length],
        } as CSSProperties;
        return <i key={i} style={style} className={i % 3 === 0 ? "round" : undefined} />;
      })}
    </span>
  );
}
