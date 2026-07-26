'use strict';

// The judge. Reads a completed conversation + the captured order and scores it
// against a fixed rubric, returning structured JSON with concrete, actionable issues.

const { chat, extractJSON } = require('./llm');
const { renderTranscript } = require('./runner');
const { JUDGE_MODEL } = require('../config');

const RUBRIC = `אתה שופט איכות מחמיר של בוט הזמנות פיצה בוואטסאפ. קיבלת תמליל שיחה בין לקוח (מדומה) לבוט,
ואת ההזמנה שנקלטה בסוף (אם נקלטה). נתח את הביצועים של הבוט לפי הממדים הבאים.

לכל ממד תן ציון בוליאני (pass=true/false) והסבר קצר:
- order_correct: ההזמנה שנקלטה תואמת למה שהלקוח באמת ביקש (פריטים, כמויות, תוספות)?
- pricing_correct: המחירים והסכום הכולל עקביים ונכונים (כולל/לא כולל דמי משלוח לפי הצורך)?
- rules_followed: הבוט עקב אחרי חוקי הזרימה — שאל deal-breakers (משלוח/איסוף + אמצעי תשלום) לפני לקיחת הזמנה, ביקש שם, הציג סיכום לאישור?
- no_hallucination: הבוט לא המציא פריטים/תוספות/מחירים שלא קיימים בתפריט, ולא הבטיח משלוח מחוץ לאזור?
- tone_ok: הטון מקצועי, חם, קצר, בלי אמוג'ים, גם תחת לחץ?
- edge_case_handled: אם הפרסונה בדקה מקרה קצה (תזמון/מחוץ לאזור/ביטול/שפה/ריבוי תוספות) — הבוט טיפל נכון?
- goal_achieved: המטרה של הלקוח הושגה בסוף השיחה?

שים לב (מניעת ייחוס שגוי): אם הבוט הציג סיכום תקין וביקש אישור, אך השיחה נקטעה כי הלקוח (המדומה) לא שלח אישור — זו מגבלת סימולציה, לא באג של הבוט. אל תזקוף במקרה כזה כשל קליטת הזמנה לחובת הבוט; ציין זאת כ-minor/סימולציה.

שים לב (זרימת קבלת הזמנות חדשה): אחרי שמירת הזמנה הבוט אומר "ההזמנה התקבלה ונשלחה למסעדה לאישור" **בלי** להבטיח שההכנה התחילה — זו ההתנהגות הנכונה (המערכת שולחת ללקוח הודעת סטטוס מדויקת בנפרד). אל תוריד ניקוד על היעדר "מכינים עכשיו".

בנוסף:
- issues: מערך של בעיות קונקרטיות. לכל בעיה: {severity: "critical"|"major"|"minor", category: "<תגית קצרה>", description: "<מה בדיוק קרה>", is_bug: true/false, evidence: "<ציטוט קצר מהשיחה>", suggestion: "<תיקון מוצע — כלל לפרומפט או תיקון קוד>"}
  - is_bug=true אם זה נראה כמו תקלה בקוד/פרומפט (לוגיקה שבורה, פעולה שלא נפלטה, JSON שגוי), לעומת בעיית איכות/סגנון.
- score: מספר 0-100 המשקלל את הכל (100 = מושלם).
- summary: משפט אחד בעברית שמסכם את הביצועים.

חשוב: החזר אך ורק JSON תקין ודחוס (compact), בלי טקסט לפני או אחרי, בלי גדרות \`\`\`. שמור על note ו-description קצרים (עד ~15 מילים) כדי לא לחרוג. מבנה:
{"dimensions":{"order_correct":{"pass":bool,"note":str}, ... },"issues":[...],"score":int,"summary":str}`;

/**
 * @param {object} record   output of runConversation()
 * @returns {Promise<object>} judgment
 */
async function judgeOnce(record) {
  const transcriptText = renderTranscript(record.transcript);
  const orderText = record.capturedOrder
    ? JSON.stringify(record.capturedOrder, null, 2)
    : '(לא נקלטה הזמנה סופית)';

  const userContent = `פרסונת הלקוח: ${record.persona.title}
מטרת הלקוח (ground truth): ${record.persona.goal}
מקרי קצה שנבדקו: ${record.persona.probes.join(', ')}
פעולות שהבוט פלט: ${record.actions.join(', ') || 'אף אחת'}
${record.error ? `שגיאת ריצה: ${record.error}` : ''}

════════ תמליל השיחה ════════
${transcriptText}

════════ ההזמנה שנקלטה ════════
${orderText}
${record.mode === 'replay' ? `
הערה: זהו replay של שיחה אמיתית — הודעות הלקוח הן תסריט קבוע ממה שלקוח אמיתי כתב. הערך עד כמה הבוט טיפל נכון בכל הודעה אמיתית (הבנת ניסוח/סלנג/שגיאות כתיב, בלי הזיות, טון). **אל תוריד ניקוד** על כך שההזמנה לא הושלמה אם הלקוח האמיתי פשוט לא סיפק את המידע הדרוש (למשל לא בחר משלוח/איסוף) — התסריט קבוע ולא ניתן לשאול אותו.` : ''}
הערך את הבוט והחזר JSON לפי הרובריקה.`;

  // Retry on malformed/truncated JSON — long transcripts occasionally overflow the
  // token budget or the model adds stray prose. Bumped budget + a stricter re-ask.
  let judgment = null;
  for (let attempt = 0; attempt < 2 && !judgment; attempt++) {
    const content = attempt === 0
      ? userContent
      : userContent + '\n\nהחזר אך ורק אובייקט JSON דחוס ושלם, בלי שום טקסט נוסף ובלי גדרות. שמור על note/description קצרים מאוד.';
    const raw = await chat({
      model: JUDGE_MODEL, system: RUBRIC,
      messages: [{ role: 'user', content }],
      maxTokens: 3072,
    });
    judgment = extractJSON(raw);
  }

  if (!judgment || typeof judgment.score !== 'number') {
    return {
      dimensions: {}, issues: [
        { severity: 'major', category: 'judge-error', description: 'השופט לא החזיר JSON תקין', is_bug: false, evidence: '', suggestion: 'בדוק את פלט השופט' },
      ], score: 0, summary: 'הערכה נכשלה', _judgeFailed: true,
    };
  }
  return judgment;
}

/**
 * Stabilized judging: N independent judgments (sonnet-5 ignores temperature, so a
 * single judgment carries ±5-7 points of noise — measured across identical runs).
 * Final score = MEDIAN of the votes; issues/summary come from the vote closest to
 * the median. `_votes`/`_voteSpread` expose the disagreement for the reports.
 *
 * @param {object} record
 * @param {object} [opts]
 * @param {number} [opts.votes]  default env SIM_JUDGE_VOTES or 3
 */
async function judgeConversation(record, opts = {}) {
  const votes = Math.max(1, Number(opts.votes ?? process.env.SIM_JUDGE_VOTES ?? 3));
  const results = (await Promise.all(
    Array.from({ length: votes }, () => judgeOnce(record).catch(() => null))
  )).filter((j) => j && !j._judgeFailed && typeof j.score === 'number');

  if (!results.length) {
    return {
      dimensions: {}, issues: [
        { severity: 'major', category: 'judge-error', description: `כל ${votes} השיפוטים נכשלו`, is_bug: false, evidence: '', suggestion: 'בדוק את פלט השופט' },
      ], score: 0, summary: 'הערכה נכשלה', _judgeFailed: true,
    };
  }

  const scores = results.map((r) => r.score).sort((a, b) => a - b);
  const median = scores[Math.floor(scores.length / 2)];
  const representative = results.reduce((best, r) =>
    Math.abs(r.score - median) < Math.abs(best.score - median) ? r : best);

  return {
    ...representative,
    score: median,
    _votes: scores,
    _voteSpread: scores[scores.length - 1] - scores[0],
  };
}

module.exports = { judgeConversation, judgeOnce, RUBRIC };
