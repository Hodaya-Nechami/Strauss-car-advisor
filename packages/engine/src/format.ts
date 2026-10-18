/** עיגול לשקל שלם, רק לתצוגה. החישוב עצמו לא מעוגל. */
export function formatShekel(n: number): string {
  return Math.round(n).toLocaleString("en-US");
}
