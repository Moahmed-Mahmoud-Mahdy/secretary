import ZAI from 'z-ai-web-dev-sdk';
import { AiInterpretationError } from '../../domain/errors';
import type {
  AiAction,
  AiInterpretation,
  AnswerQuestionInput,
  IAiAssistantService,
  InterpretInput,
  SmallTalkInput,
} from '../../application/ports';

// ============================================================
// Gemini-class AI provider implementation (z-ai SDK) behind the
// IAiAssistantService port — swappable without touching the
// application or domain layers (BRD §32).
// ============================================================

type ZaiClient = Awaited<ReturnType<typeof ZAI.create>>;

let clientPromise: Promise<ZaiClient> | null = null;

async function getClient(): Promise<ZaiClient> {
  if (!clientPromise) {
    clientPromise = ZAI.create();
  }
  return clientPromise;
}

async function complete(messages: { role: 'user' | 'assistant'; content: string }[], retries = 2): Promise<string> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      const client = await getClient();
      const completion = await client.chat.completions.create({
        messages,
        thinking: { type: 'disabled' },
      });
      const content = completion.choices[0]?.message?.content;
      if (!content || content.trim().length === 0) throw new Error('empty AI response');
      return content;
    } catch (error) {
      lastError = error;
      if (attempt < retries) {
        await new Promise((resolve) => setTimeout(resolve, 400 * attempt));
      }
    }
  }
  throw lastError instanceof Error ? lastError : new Error('AI call failed');
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
CREATE_TASK, CREATE_EVENT, CREATE_EXPENSE, CREATE_INCOME, SET_BUDGET, CREATE_PROJECT, COMPLETE_TASK, DELETE_TASK, UPDATE_TASK, DELETE_EVENT, PLAN_DAY, QUERY, CHITCHAT, MULTI_ACTION, UNKNOWN

أنواع الـ Actions (التزم بالحقول دي بالظبط):
{"type":"CREATE_TASK","title":"...","priority":"LOW"|"MEDIUM"|"HIGH"|"URGENT","estimatedMinutes":null|عدد الدقايق,"deadline":null|"YYYY-MM-DDTHH:mm:ss","projectName":null|"اسم المشروع","description":null|"وصف"}
{"type":"CREATE_EVENT","title":"...","startAt":"YYYY-MM-DDTHH:mm:ss","endAt":null|"YYYY-MM-DDTHH:mm:ss","recurrence":null|"DAILY"|"WEEKLY"|"MONTHLY"}
{"type":"CREATE_EXPENSE","amount":عدد,"category":"FOOD"|"TRANSPORT"|"EDUCATION"|"PROJECTS"|"BILLS"|"SHOPPING"|"ENTERTAINMENT"|"OTHER","description":null|"وصف","date":null|"YYYY-MM-DD"}
{"type":"CREATE_INCOME","amount":عدد,"source":null|"المصدر","date":null|"YYYY-MM-DD"}
{"type":"SET_BUDGET","amount":عدد}
{"type":"CREATE_PROJECT","name":"...","deadline":null|"YYYY-MM-DD"}
{"type":"COMPLETE_TASK","taskName":"اسم المهمة زي ما المستخدم قالها"}
{"type":"DELETE_TASK","taskName":"اسم المهمة"}
{"type":"UPDATE_TASK","taskName":"اسم المهمة","fields":{"title"?:"...","priority"?:"...","deadline"?:"YYYY-MM-DDTHH:mm:ss","estimatedMinutes"?:عدد,"description"?:"..."}}
{"type":"DELETE_EVENT","eventName":"اسم الحدث"}
{"type":"PLAN_DAY","date":null|"YYYY-MM-DD"}
{"type":"QUERY","queryType":"FINANCE_SUMMARY"|"BUDGET_STATUS"|"TODAY_SCHEDULE"|"TASKS_STATUS"|"GENERAL","question":"سؤال المستخدم زي ما قاله"}
{"type":"CHITCHAT","message":"..."}

قواعد مهمة جدًا:
1. التاريخ والوقت دلوقتي: ${context.nowIso} — اليوم ${context.weekdayName} (${context.dayKey}). استخدمهم لفهم "النهارده" و"بكرة" و"بعد بكرة" و"امبارح" و"الخميس الجاي" و"بعد ساعتين". أي يوم أسبوع جاي = أقرب تاريخ مطابق بعد النهارده.
2. كل الأوقات بتوقيت القاهرة. لو المهمة من غير ساعة محددة خلي deadline الساعة 23:59:59. لو ذكر مدة (مثلاً "ساعتين") حسبها بالدقايق في estimatedMinutes (120).
3. الفلوس بالجنيه المصري. استخرج الأرقام حتى لو بالحروف: مية=100، ميتين=200، نص=50، ربع=25، ألف=1000. "جنيه" و"ج" و"EGP" كلها نفس المعنى.
4. لو الرسالة فيها أكتر من طلب، رتّبهم في actions بنفس ترتيب المستخدم وخلي intent=MULTI_ACTION. مثال: "دفعت 100 جنيه مواصلات وبكرة عندي محاضرة الساعة 10" = CREATE_EXPENSE + CREATE_EVENT.
5. لو المستخدم بيسأل (مثال: "إيه مصاريفي؟"، "عندي إيه النهارده؟"، "قد إيه صرفت الشهر ده؟"، "إيه المهام اللي معايا؟") → intent=QUERY ولازم actions يكون فيه عنصر واحد {"type":"QUERY","queryType":"...","question":"السؤال زي ما كتبه"}. ممنوع تسيب actions فاضية مع QUERY.
6. لو الرسالة مجرد سلام أو كلام عام من غير طلب → CHITCHAT.
7. ممنوع تخترع بيانات مش موجودة في الرسالة. لو مش فاهم الطلب → intent=UNKNOWN و actions=[]. لو الرسالة فيها أكتر من intent مختلف خلي intent=MULTI_ACTION.
8. مشاريع المستخدم الحالية: ${context.projects.length > 0 ? context.projects.join('، ') : 'مفيش'}. لو ذكر اسم مشروع موجود اكتبه في projectName زي ما هو، لو ذكر اسم مش موجود خلي projectName بالنص اللي قاله وهيتعمل تلقائي.
9. مهام المستخدم المفتوحة: ${context.openTasks.length > 0 ? context.openTasks.map((t) => t.title).join('، ') : 'مفيش'}. لو قال "خلصت/خلص/عملت" حاجة منهم → COMPLETE_TASK باسمها.
10. تصنيف المصاريف: FOOD=أكل ومقاهي، TRANSPORT=مواصلات وأوبر وبنزين، EDUCATION=مذاكرة وكتب ودورات، PROJECTS=مصاريف مشاريعه، BILLS=كهرباء ومية وانترنت، SHOPPING=ملابس وحاجات، ENTERTAINMENT=خروجات وسينما وألعاب، OTHER=أي حاجة تانية. الـ description لازم يكون اسم البند بس مختصر (مثال: "مواصلات"، "فاتورة الكهربا"، "غدا") — ممنوع تحط الجملة كلها بتاعة المستخدم فيه.
11. "خطة" أو "نظّم يومي" أو "رتب مهامي" → PLAN_DAY.
12. ممنوع تطلع أي حاجة غير الـ JSON.`;
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
- جاوب من الـ JSON ده وبس. ممنوع منعًا باتًا تخترع أرقام أو مواعيد أو مهام مش في الداتا.
- لو الداتا فاضية أو مش فيها إجابة، قول له بصراحة إن مفيش بيانات لسه.
- جاوب في سطرين على بعض، بالمصري، بأسلوب ودود مبالغش فيه. ممكن إيموجي واحد بس لو مناسب.
- الأرقام اللي تقولها قرّبها بشكل مقروء (مثلاً 5250 جنيه).`;
    return complete([
      { role: 'assistant', content: system },
      { role: 'user', content: `السؤال: ${input.question}\n\nالداتا الحقيقية:\n${input.dataJson}` },
    ]);
  }

  async smallTalk(input: SmallTalkInput): Promise<string> {
    const system = `أنت "سكرتير" — مساعد شخصي بتكلم بالمصري الطبيعي، ودود ومختصر، من غير تصنع ومن غير إيموجي كتير.
اسم المستخدم: ${input.userName}. ردّ على كلامه في جملة أو اتنين بالكتير، وممكن تقترح عليه توجّه (مهام، مواعيد، مصاريف، خطة يوم) بشكل طبيعي لو مناسب.`;
    return complete([
      { role: 'assistant', content: system },
      { role: 'user', content: input.message },
    ]);
  }
}
