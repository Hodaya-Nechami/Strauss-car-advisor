import { readJson, requireRepPassword, requireSessionId, respond } from "@/lib/http";
import { ChatError, answerRepQuestion, listOpenRepQuestions, listRepHistory } from "@/lib/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_ANSWER_LENGTH = 2000;

/** בשביל מסך הנציג: השאלות הפתוחות, וההיסטוריה של מה שכבר נענה */
export async function GET(req: Request) {
  return respond(() => {
    requireRepPassword(req);
    return { open: listOpenRepQuestions(), history: listRepHistory() };
  });
}

/** הנציג ענה על שאלה, והשיחה של העובד ממשיכה מאותה נקודה */
export async function POST(req: Request) {
  const body = await readJson(req);
  return respond(() => {
    requireRepPassword(req);
    const sessionId = requireSessionId(body.sessionId);
    const ticketId = typeof body.ticketId === "string" ? body.ticketId : "";
    if (!ticketId) throw new ChatError(400, "חסר מזהה פנייה");
    const answer = typeof body.answer === "string" ? body.answer.trim() : "";
    if (!answer) throw new ChatError(400, "התשובה ריקה");
    if (answer.length > MAX_ANSWER_LENGTH) throw new ChatError(400, "התשובה ארוכה מדי");
    return answerRepQuestion(sessionId, ticketId, answer);
  });
}
