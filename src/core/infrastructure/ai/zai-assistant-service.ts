import { AiInterpretationError } from '../../domain/errors';
import { executeWithKeyRotation } from './gemini-key-provider';
import type {
  AiAction,
  AiInterpretation,
  AnswerQuestionInput,
  IAiAssistantService,
  InterpretInput,
  SmallTalkInput,
} from '../../application/ports';

// ============================================================
// Google Gemini AI provider implementation behind the
// IAiAssistantService port — swappable without touching the
// application or domain layers (BRD §32).
// ============================================================

async function completeGemini(messages: { role: 'user' | 'assistant'; content: string }[], apiKey: string): Promise<string> {
  let systemPrompt = '';
  const contents: Array<{ role: string; parts: Array<{ text: string }> }> = [];

  for (let i = 0; i < messages.length; i += 1) {
    const msg = messages[i];
    if (i === 0 && msg.role === 'assistant') {
      systemPrompt = msg.content;
    } else {
      contents.push({
        role: msg.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: msg.content }],
      });
    }
  }

  const payload: Record<string, unknown> = { contents };
  if (systemPrompt) {
    payload.systemInstruction = { parts: [{ text: systemPrompt }] };
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${apiKey}`;
  let lastErr: Error | null = null;

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Gemini API error ${res.status}: ${errText}`);
      }

      const data = await res.json();
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text || text.trim().length === 0) throw new Error('empty Gemini AI response');
      return text;
    } catch (err) {
      lastErr = err instanceof Error ? err : new Error(String(err));
      if (attempt < 3) {
        await new Promise((r) => setTimeout(r, 600 * attempt));
      }
    }
  }

  throw lastErr || new Error('Gemini API call failed after retries');
}

async function complete(messages: { role: 'user' | 'assistant'; content: string }[]): Promise<string> {
  return executeWithKeyRotation((key) => completeGemini(messages, key));
}

function extractJson(raw: string): { intent?: string; actions?: unknown } | null {
  let text = raw.trim();
  // Strip markdown fences if the model added them.
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) text = fence[1].trim();
  // Strip leading prose before the first brace.
  const firstBrace = text.indexOf('{');
  const lastBrace = text.lastIndexOf('}');
  if (firstBrace === -1 || lastBrace === -1) return null;
  text = text.slice(firstBrace, lastBrace + 1);
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function buildInterpretSystemPrompt(context: InterpretInput['context']): string {
  return `أنت "محرك النوايا" بتاع تطبيق سكرتير — مساعد شخصي للمستخدم المصري.
مهمتك الوحيدة: تحليل رسالة المستخدم (مكتوبة بالمصري الطبيعي) واستخراج الأوامر اللي عايز ينفذها.

رجّع JSON صالح بس — ممنوع أي نص تاني أو markdown — بالشكل ده:
{"intent":"<INTENT>","actions":[<ACTION>،...]}

INTENT يكون واحد من:
CREATE_TASK, CREATE_EVENT, CREATE_EXPENSE, CREATE_INCOME, SET_BUDGET, CREATE_PROJECT, COMPLETE_TASK, DELETE_TASK, UPDATE_TASK, DELETE_EVENT, UPDATE_EXPENSE, UPDATE_INCOME, POSTPONE, TRANSFER_BUDGET, PLAN_DAY, QUERY, CHITCHAT, MULTI_ACTION, SUGGEST_PLAN, UNKNOWN

أنواع الـ Actions (التزم بالحقول دي بالظبط):
{"type":"CREATE_TASK","title":"...","priority":"LOW"|"MEDIUM"|"HIGH"|"URGENT","estimatedMinutes":null|عدد الدقايق,"deadline":null|"YYYY-MM-DDTHH:mm:ss","projectName":null|"اسم المشروع","description":null|"وصف"}
{"type":"CREATE_EVENT","title":"...","startAt":"YYYY-MM-DDTHH:mm:ss","endAt":null|"YYYY-MM-DDTHH:mm:ss","recurrence":null|"DAILY"|"WEEKLY"|"MONTHLY"}
{"type":"CREATE_EXPENSE","amount":عدد,"category":"FOOD"|"TRANSPORT"|"EDUCATION"|"PROJECTS"|"BILLS"|"SHOPPING"|"ENTERTAINMENT"|"OTHER","description":null|"وصف","date":null|"YYYY-MM-DD"}
{"type":"CREATE_INCOME","amount":عدد,"source":null|"المصدر","date":null|"YYYY-MM-DD"}
{"type":"SET_BUDGET","amount":عدد}
{"type":"SET_CATEGORY_BUDGET","category":"FOOD"|"TRANSPORT"|"EDUCATION"|"PROJECTS"|"BILLS"|"SHOPPING"|"ENTERTAINMENT"|"OTHER","amount":عدد}
{"type":"CREATE_PROJECT","name":"...","deadline":null|"YYYY-MM-DD"}
{"type":"COMPLETE_TASK","taskName":"اسم المهمة زي ما المستخدم قالها"}
{"type":"DELETE_TASK","taskName":"اسم المهمة"}
{"type":"UPDATE_TASK","taskName":"اسم المهمة","fields":{"title"?:"...","priority"?:"...","deadline"?:"YYYY-MM-DDTHH:mm:ss","estimatedMinutes"?:عدد,"description"?:"..."}}
{"type":"DELETE_EVENT","eventName":"اسم الحدث"}
{"type":"UPDATE_EXPENSE","expenseName":"اسم المصروف زي ما هو مسجل (الوصف)","amount":null|عدد جديد,"category":null|"FOOD"|"TRANSPORT"|"EDUCATION"|"PROJECTS"|"BILLS"|"SHOPPING"|"ENTERTAINMENT"|"OTHER"}
{"type":"UPDATE_INCOME","incomeName":"مصدر الدخل زي ما هو مسجل","amount":عدد جديد}
{"type":"POSTPONE","taskName":"اسم المهمة الموجودة","toDate":"YYYY-MM-DD","toTime":null|"HH:mm"}
{"type":"TRANSFER_BUDGET","fromCategory":"FOOD"|"TRANSPORT"|"EDUCATION"|"PROJECTS"|"BILLS"|"SHOPPING"|"ENTERTAINMENT"|"OTHER","toCategory":"نفس القائمة","amount":عدد}
{"type":"CREATE_PROJECT_WITH_TASKS","name":"اسم المشروع","description":null,"deadline":null|"YYYY-MM-DD","tasks":[{"title":"خطوة مختصرة","priority":"LOW"|"MEDIUM"|"HIGH"|"URGENT","estimatedMinutes":عدد|null}]}
{"type":"ADD_SUBTASKS","taskName":"اسم المهمة الموجودة","subtasks":["خطوة 1","خطوة 2","خطوة 3"]}
{"type":"PLAN_DAY","date":null|"YYYY-MM-DD"}
{"type":"QUERY","queryType":"FINANCE_SUMMARY"|"BUDGET_STATUS"|"TODAY_SCHEDULE"|"TASKS_STATUS"|"HABITS"|"MONTH_REPORT"|"PRODUCTIVITY"|"GENERAL","question":"سؤال المستخدم زي ما قاله"}
{"type":"CHITCHAT","message":"..."}

قواعد مهمة جدًا:
1. التاريخ والوقت دلوقتي: ${context.nowIso} — اليوم ${context.weekdayName} (${context.dayKey}). استخدمهم لفهم "النهارده" و"بكرة" و"بعد بكرة" و"امبارح" و"الخميس الجاي" و"بعد ساعتين". أي يوم أسبوع جاي = أقرب تاريخ مطابق بعد النهارده.
2. كل الأوقات بتوقيت القاهرة. لو المهمة من غير ساعة محددة خلي deadline الساعة 23:59:59. لو ذكر مدة (مثلاً "ساعتين") حسبها بالدقايق في estimatedMinutes (120).
3. الفلوس بالجنيه المصري. استخرج الأرقام حتى لو بالحروف: مية=100، ميتين=200، نص=50، ربع=25، ألف=1000. "جنيه" و"ج" و"EGP" كلها نفس المعنى.
4. لو الرسالة فيها أكتر من طلب، رتّبهم في actions بنفس ترتيب المستخدم وخلي intent=MULTI_ACTION. مثال: "دفعت 100 جنيه مواصلات وبكرة عندي محاضرة الساعة 10" = CREATE_EXPENSE + CREATE_EVENT.
5. لو المستخدم بيسأل (مثال: "إيه مصاريفي؟"، "عندي إيه النهارده؟"، "قد إيه صرفت الشهر ده؟"، "إيه المهام اللي معايا؟"، "إيه عاداتي المتكررة؟"، "عاداتي وسلسلتي وصلت كام؟") → intent=QUERY ولازم actions يكون فيه عنصر واحد {"type":"QUERY","queryType":"...","question":"السؤال زي ما كتبه"}. لو السؤال عن عادات أو التزامات متكررة أو فواتير بتتكرر استخدم queryType=HABITS. لو السؤال عن تقرير/مقارنة الشهر (تقرير الشهر، صرفي مقارنة بالشهر اللي فات، الشهر ده كام) استخدم queryType=MONTH_REPORT. لو السؤال عن إنتاجيته أو أحسن وقت بيتنجز فيه استخدم queryType=PRODUCTIVITY. ممنوع تسيب actions فاضية مع QUERY.
6. لو الرسالة مجرد سلام أو كلام عام من غير طلب → CHITCHAT.
7. ممنوع تخترع بيانات مش موجودة في الرسالة. لو مش فاهم الطلب → intent=UNKNOWN و actions=[]. لو الرسالة فيها أكتر من intent مختلف خلي intent=MULTI_ACTION.
8. مشاريع المستخدم الحالية: ${context.projects.length > 0 ? context.projects.join('، ') : 'مفيش'}. لو ذكر اسم مشروع موجود اكتبه في projectName زي ما هو، لو ذكر اسم مش موجود خلي projectName بالنص اللي قاله وهيتعمل تلقائي.
9. مهام المستخدم المفتوحة: ${context.openTasks.length > 0 ? context.openTasks.map((t) => t.title).join('، ') : 'مفيش'}. لو قال "خلصت/خلص/عملت" حاجة منهم → COMPLETE_TASK باسمها.
10. تصنيف المصاريف: FOOD=أكل ومقاهي، TRANSPORT=مواصلات وأوبر وبنزين، EDUCATION=مذاكرة وكتب ودورات، PROJECTS=مصاريف مشاريعه، BILLS=كهرباء ومية وانترنت، SHOPPING=ملابس وحاجات، ENTERTAINMENT=خروجات وسينما وألعاب، OTHER=أي حاجة تانية. الـ description لازم يكون اسم البند بس مختصر (مثال: "مواصلات"، "فاتورة الكهربا"، "غدا") — ممنوع تحط الجملة كلها بتاعة المستخدم فيه.
11. "خطة" أو "نظّم يومي" أو "رتب مهامي" → PLAN_DAY.
12. لو المستخدم بيقول هدف كبير أو مشروع من غير تفاصيل (مثال: "عايز أعمل موقع تخرج"، "عايز أخلص مشروع الـPOS"، "عايز أتعلم برمجة") → intent=SUGGEST_PLAN و actions فيه عنصر واحد CREATE_PROJECT_WITH_TASKS: اسم المشروع + 4-8 مهام منطقية مترتبة بترتيب التنفيذ، كل مهمة بمدة تقديرية معقولة. لو الهدف مطابق لاسم مشروع من مشاريع المستخدم استخدم نفس الاسم وجزّئه لمهام جديدة جواه. ممنوع تختلق deadline.
13. لو المستخدم طلب تقسيم مهمة موجودة لخطوات (مثال: "قسمل مهمة X لخطوات"، "ضيف خطوات تحت X") → action واحد ADD_SUBTASKS باسم المهمة و3-6 خطوات.
14. "خلي/ظبط/حدد ميزانية [الفئة] بمبلغ" أو "حد صرفي على الأكل كذا" (فئة معينة من غير ما يقول ميزانية الشهر كلها) → SET_CATEGORY_BUDGET بالفئة المناسبة. لو قال "ميزانيتي كذا" من غير فئة → SET_BUDGET.
15. لو المستخدم عايز يصحّح أو يعدّل مصروف اتسجل قبل كده (مثال: "المصروف اللي سجلته مواصلات كان 60 مش 50"، "انقل مصروف الفطار لفئة الأكل"، "التصنيف بتاع X غلط خليه Y") → action واحد UPDATE_EXPENSE باسم المصروف (expenseName) والمبلغ الجديد و/أو الفئة الجديدة. ممنوع تستخدم UPDATE_EXPENSE لمصروف جديد — ده لبيعدي.
16. لو المستخدم عايز يصحّح دخل اتسجل قبل كده (مثال: "الراتب اللي سجلته كان 9000 مش 8000"، "دخل الفريلانس كان 3000 مش 2500") → action واحد UPDATE_INCOME باسم مصدر الدخل (incomeName) والمبلغ الجديد. ممنوع تستخدمه لدخل جديد.
17. لو المستخدم بيسأل عن عاداته أو التزاماته المتكررة أو سلسلة التزامه (مثال: "إيه عاداتي المتكررة؟"، "عندي إيه عادات؟"، "الفاتورات اللي بتتكرر إيه حكاها؟") → intent=QUERY و queryType=HABITS.
18. "إيه أحسن وقت بتنجز فيه؟"، "إنتاجيتي عاملة إيه؟"، "بتخلص قد إيه مهام في اليوم؟" → QUERY بـ queryType=PRODUCTIVITY. و"تقرير الشهر"، "صرفي الشهر ده مقارنة باللي فات"، "هخلص من ميزانيتي كام؟" → QUERY بـ queryType=MONTH_REPORT.
19. لو المستخدم عايز يؤجّل أو يخّر أو يورّح مهمة موجودة (مثال: "أجل مهمة X لبكرة"، "أخّر مذاكرة التاريخ لحد السبت"، "أورّحها لبعد بكرة الساعة 5"، "المهمة دي صعبة أخّرها لأول الأسبوع") → action واحد POSTPONE: toDate هو اليوم الجديد YYYY-MM-DD، وtoTime الساعة الجديدة بصيغة 24 ساعة ("17:00") لو قال ساعة محددة، ولو ماقالش ساعة خلي toTime=null. ممنوع تستخدم POSTPONE لمهمة جديدة — ده للتحويل لمواعيد موجودة بس.
20. لو المستخدم عايز ينقل فلوس بين حودود صرف الفئات (مثال: "حول 100 جنيه من حد الأكل لحد المواصلات"، "زود حد المواصلات بـ 50 من حد التسوق"، "نقص حد الأكل 50 وحطهم في الترفيه") → action واحد TRANSFER_BUDGET: fromCategory هي الفئة اللي الفلوس بتخرج منها، toCategory اللي بتتضاف لها، وamount المبلغ. لازم الفئتين يبقوا مختلفتين. لو بيقول "زود حد X" من غير ما يحدد مصدر → استخدم SET_CATEGORY_BUDGET بالمبلغ الجديد الكلي.
21. ممنوع تطلع أي حاجة غير الـ JSON.`;
}

export class ZaiAssistantService implements IAiAssistantService {
  async interpret(input: InterpretInput): Promise<AiInterpretation> {
    const messages = [
      { role: 'assistant' as const, content: buildInterpretSystemPrompt(input.context) },
      { role: 'user' as const, content: input.message },
    ];

    for (let attempt = 1; attempt <= 2; attempt += 1) {
      const raw = await complete(messages);
      const parsed = extractJson(raw);
      const rawActions = Array.isArray(parsed?.actions) ? parsed.actions : [];
      if (parsed && typeof parsed.intent === 'string') {
        const actions = (rawActions as AiAction[]).filter(
          (a) => a && typeof a === 'object' && typeof a.type === 'string'
        );
        return { intent: parsed.intent, actions };
      }
      if (attempt === 1) {
        // One retry with a stricter reminder.
        messages.push({ role: 'assistant', content: 'ردّك مش JSON صالح. رجّع JSON بس بالشكل المطلوب، من غير أي كلام زيادة.' });
      }
    }
    throw new AiInterpretationError();
  }

  async answerQuestion(input: AnswerQuestionInput): Promise<string> {
    const system = `أنت "سكرتير" — مساعد شخصي ودود بتكلم المصري الطبيعي (مش فصحى) زي واحد صاحبك بيساعده.
المستخدم: ${input.userName}.
هيبةلك سؤال ومعاه داتا حقيقية من نظام المستخدم (JSON).
قواعد صارمة:
- جاوب من الـ JSON ده وبس. ممنوع منعًا باتًا تخترع أرقام أو مواعيد أو مهام أو أسماء مش في الداتا — انقل أسماء المهام والعادات والحاجات زي ما هي بالحرف.
- خاطب المستخدم دايمًا بصيغة المذكر المباشر: كل جملة تبدأ بـ "انت/عندك/خلصت/صرفت" — ممنوع نهائيًا "عندها/عنده/له/لهذا/يحب" (دي كلام عن حد تالث).
- لو الداتا فاضية أو مش فيها إجابة، قول له بصراحة إن مفيش بيانات لسه.
- جاوب في سطرين على بعض، بالمصري، بأسلوب ودود مبالغش فيه. ممكن إيموجي واحد بس لو مناسب.
- الأرقام اللي تقولها قرّبها بشكل مقروء (مثلاً 5250 جنيه).
- تذكير أخير قبل ما تجاوب: راجع ردّك — لو فيه كلمة "عندها" أو "عنده" غيّرها لـ "عندك" فورًا.`;
    return complete([
      { role: 'assistant', content: system },
      { role: 'user', content: `السؤال: ${input.question}\n\nالداتا الحقيقية:\n${input.dataJson}` },
    ]);
  }

  async smallTalk(input: SmallTalkInput): Promise<string> {
    const system = `أنت "سكرتير" — مساعد شخصي بتكلم بالمصري الطبيعي، ودود ومختصر، من غير تصنع ومن غير إيموجي كتير.
اسم المستخدم: ${input.userName}. خاطبه دايمًا بصيغة المذكر المباشر (عندك، انت) — ممنوع "عندها/عنده". ردّ على كلامه في جملة أو اتنين بالكتير، وممكن تقترح عليه توجّه (مهام، مواعيد، مصاريف، خطة يوم) بشكل طبيعي لو مناسب.`;
    return complete([
      { role: 'assistant', content: system },
      { role: 'user', content: input.message },
    ]);
  }
}
