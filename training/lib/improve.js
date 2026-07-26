'use strict';

// The improver. Takes ALL judged conversations from a batch and synthesizes the
// three deliverables the user asked for:
//   1. bugs        — stress-test findings (code/prompt defects) to fix
//   2. lessons     — accumulated "seniority": prompt rules that would prevent the failures
//   3. dataset     — high-scoring conversations exported as fine-tuning candidates
//
// The improver only PROPOSES. Applying lessons to the real prompt is a separate,
// opt-in step (see training/README.md) so production behavior never changes silently.

const { chatJSON } = require('./llm');
const { renderTranscript } = require('./runner');
const { IMPROVE_MODEL } = require('../config');

const SYSTEM = `אתה מהנדס איכות בכיר של בוט הזמנות פיצה. קיבלת אוסף שיחות מדומות שכל אחת כבר קיבלה ציון וזוהו בה בעיות.
המשימה שלך: לסנתז מהמכלול תובנות ברמת המערכת (לא לחזור על כל בעיה בנפרד).

החזר JSON תקין בלבד במבנה:
{
  "bugs": [ {"title": str, "severity": "critical"|"major"|"minor", "where": "prompt"|"code"|"unknown", "description": str, "repro": str, "fix": str} ],
  "lessons": [ str ],
  "themes": [ {"theme": str, "count": int, "affected_personas": [str]} ],
  "prompt_patch_suggestion": str,
  "overall_summary": str
}

הנחיות:
- bugs: רק תקלות אמיתיות (לוגיקה שבורה, פעולה שלא נפלטה, מחיר שגוי, JSON שבור, הבטחת משלוח מחוץ לאזור). מיין לפי חומרה.
- lessons: כללים קצרים, קונקרטיים ואופרטיביים בעברית שאפשר להוסיף ישירות לפרומפט של הבוט כדי למנוע את הכשלים. כל לקח = שורה אחת, ניסוח ציווי ("כאשר X — עשה Y"). אל תמציא לקחים שלא נובעים מהנתונים. מקסימום 8 לקחים, החשובים ביותר.
- themes: קבץ בעיות חוזרות לנושאים עם ספירה.
- prompt_patch_suggestion: פסקה קצרה שמתארת את השינוי הכי חשוב שהייתי מכניס לפרומפט עכשיו.
- overall_summary: 2-3 משפטים על מצב הבוט.`;

/**
 * @param {Array} judged  [{record, judgment}]
 * @returns {Promise<object>} synthesis
 */
async function synthesize(judged) {
  // Compress each conversation into a compact digest to fit many into one context.
  const digests = judged.map(({ record, judgment }, i) => {
    const issues = (judgment.issues || [])
      .map((x) => `    [${x.severity}${x.is_bug ? '/bug' : ''}] ${x.category}: ${x.description}${x.suggestion ? ` → ${x.suggestion}` : ''}`)
      .join('\n');
    return `#${i + 1} פרסונה="${record.persona.title}" ציון=${judgment.score} הושלם=${record.completed ? 'כן' : 'לא'} מקרי-קצה=${record.persona.probes.join('/')}
  סיכום: ${judgment.summary || ''}
  בעיות:
${issues || '    (אין)'}`;
  }).join('\n\n');

  const avg = Math.round(judged.reduce((s, j) => s + (j.judgment.score || 0), 0) / (judged.length || 1));

  const synthesis = await chatJSON({
    model: IMPROVE_MODEL,
    system: SYSTEM,
    messages: [{
      role: 'user',
      content: `סה"כ ${judged.length} שיחות, ציון ממוצע ${avg}.\n\n${digests}\n\nסנתז את התובנות והחזר JSON.`,
    }],
    maxTokens: 3000,
    temperature: 0.3,
  });

  return synthesis || { bugs: [], lessons: [], themes: [], prompt_patch_suggestion: '', overall_summary: 'סינתזה נכשלה' };
}

/**
 * Build few-shot examples from failed conversations: (situation -> what the bot
 * SHOULD have done). Uses the judge's suggestions as the corrective signal.
 */
function harvestExamples(judged) {
  const examples = [];
  for (const { record, judgment } of judged) {
    for (const issue of judgment.issues || []) {
      if (issue.severity === 'minor') continue;
      if (!issue.suggestion) continue;
      examples.push({
        persona: record.persona.id,
        category: issue.category,
        situation: issue.evidence || record.persona.goal,
        wrong: issue.description,
        correct: issue.suggestion,
      });
    }
  }
  return examples;
}

/** Export high-scoring conversations as fine-tuning candidates (messages format). */
function harvestDataset(judged, minScore = 85) {
  const records = [];
  for (const { record, judgment } of judged) {
    if ((judgment.score || 0) < minScore) continue;
    if (!record.completed) continue;
    const messages = record.transcript.map((t) => ({
      role: t.speaker === 'customer' ? 'user' : 'assistant',
      content: t.text,
    }));
    records.push({
      persona: record.persona.id,
      score: judgment.score,
      order: record.capturedOrder,
      messages,
    });
  }
  return records;
}

module.exports = { synthesize, harvestExamples, harvestDataset };
