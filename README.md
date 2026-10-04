# 🤖 سكرتير (Sekretir) — مساعدك الشخصي الذكي بالعامية المصرية

> **"سكرتير"** هو مساعد شخصي ذكي متكامل مصمم خصيصاً ليفهمك ويتحدث معك بالعامية المصرية الطبيعية. يساعدك في إدارة حياتك اليومية، تنظيم المهام والمشاريع، تتبع المصاريف والدخل، وتخطيط يومك بكل سهولة عبر الأوامر النصية والصوتية.

---

## ✨ المميزات الرئيسية (Key Features)

### 🎙️ 1. التفاعل الذكي (النصي والصوتي)
- **فهم العامية المصرية:** يفهم كلماتك اليومية مثل *"دفعت 50 جنيه مواصلات"*, *"ورايا مذاكرة بكرة الساعة 10"*, *"أجّل مهمة الفواتير للسبت"*.
- **التسجيل الصوتي المباشر (Voice Input):** إمكانية إدخال الأوامر عن طريق الصوت وتحويلها فوراً لنصوص مدمجة باستخدام نموذج **Google Gemini ASR**.
- **محرك النوايا (Intent Engine):** تحليل وتفكيك الأوامر المركبة وتنفيذها تلقائياً.

### 📋 2. إدارة المهام والمشاريع (Tasks & Projects)
- **تنظيم شامل:** إضافة المهام مع الأولوية (`LOW`, `MEDIUM`, `HIGH`, `URGENT`) والمواعيد النهائية.
- **تفكيك الأهداف الذكي:** اقتراح خطة عمل وتقسيم المشاريع الكبيرة إلى خطوات فرعية (Subtasks).
- **تخطيط اليوم (Plan Day):** ميزة جدولة وتنظيم مهامك اليومية بضغطة زر.

### 💰 3. إدارة المالية والميزانية (Finance & Budget)
- **تتبع المصاريف والدخل:** تسجيل المصاريف حسب الفئات (أكل، مواصلات، تعليم، مشاريع، فواتير، تسوق، ترفيه).
- **الميزانية الشهرية:** تحديد ميزانية شهرية ومتابعة نسبة الصرف لكل فئة (Category Budgets).
- **التقارير والملخصات:** استفسر عن مصاريفك وتقريرك المالي بالعامية المصرية في أي وقت.

---

## 🛠️ التقنيات المستخدمة (Tech Stack)

| المجال | التقنية |
| :--- | :--- |
| **الإطار العام (Framework)** | [Next.js 16](https://nextjs.org/) (App Router, React 19) |
| **لغة البرمجة** | [TypeScript](https://www.typescriptlang.org/) |
| **التصميم والواجهة** | [Tailwind CSS](https://tailwindcss.com/), Shadcn UI, Radix UI, Lucide Icons |
| **قاعدة البيانات** | [Neon PostgreSQL](https://neon.tech/) السحابية عبر [Prisma ORM](https://www.prisma.io/) |
| **الذكاء الاصطناعي (AI)** | [Google Gemini API](https://aistudio.google.com/) (`gemini-flash-latest`) |

---

## 🚀 طريقة التشغيل المباشر (Quick Start)

### 1. استنساخ المشروع وتثبيت الحزم
```bash
git clone https://github.com/your-username/sekretir.git
cd sekretir
npm install
```

### 2. إعداد متغيرات البيئة (Environment Variables)
أنشئ ملف `.env` في المجلد الرئيسي بناءً على [.env.example](file:///.env.example):
```env
# قاعدة البيانات (Neon PostgreSQL)
DATABASE_URL="postgresql://username:password@ep-sample-pooler.c-5.eu-central-1.aws.neon.tech/neondb?sslmode=require"

# التوثيق والأمان
AUTH_SECRET="your-secret-key"

# مفتاح الذكاء الاصطناعي (Google Gemini)
GEMINI_API_KEY="your-gemini-api-key"
```

### 3. مزامنة قاعدة البيانات (Prisma DB Sync)
```bash
npm run db:push
npm run db:generate
```

### 4. تشغيل خادم التطوير المحلي
```bash
npm run dev
```
افتح المتصفح على: **`http://localhost:3000`** 🎉

---

## 📜 السكريبتات المتاحة (Available Scripts)

- `npm run dev`: تشغيل التطبيق في بيئة التطوير المحلية.
- `npm run build`: بناء النسخة النهائية للإنتاج (Production Build).
- `npm run db:push`: مزامنة الـ Schema مع قاعدة بيانات Neon.
- `npm run db:generate`: توليد Prisma Client.
- `npm run lint`: فحص واستكشاف أخطاء الكود.

---

## 🔒 الأمان وتدابير الخصوصية
- تم إدراج ملفات البيئة `.env` وجميع المفاتيح وقواعد البيانات المحلية في ملف `.gitignore` لمنع رفع أي بيانات حساسة إلى Git.
