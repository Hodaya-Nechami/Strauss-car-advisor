/** קישורים שפותחים מייל מוכן: ב-Gmail בדפדפן, או בתוכנת המייל של המחשב */
export interface MailDraft {
  to: string;
  subject: string;
  body: string;
}

export function draftLinks({ to, subject, body }: MailDraft): { gmail: string; mailto: string } {
  const enc = encodeURIComponent;
  // authuser: כשיש כמה חשבונות גוגל בדפדפן, נפתח החשבון שאיתו העובד נכנס למערכת
  const account = to ? `authuser=${enc(to)}&` : "";
  return {
    gmail: `https://mail.google.com/mail/?${account}view=cm&fs=1&to=${enc(to)}&su=${enc(subject)}&body=${enc(body)}`,
    mailto: `mailto:${enc(to)}?subject=${enc(subject)}&body=${enc(body)}`,
  };
}
