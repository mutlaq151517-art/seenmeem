import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import mongoose from "mongoose";
import bcrypt from "bcrypt";
import path from "path";
import { fileURLToPath } from "url";
import OpenAI from "openai";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

/* ================= OpenAI ================= */

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

/* ================= Mongo ================= */

mongoose.connect(process.env.MONGO_URI)
.then(() => console.log("MongoDB Connected"))
.catch(err => console.log("MongoDB Error", err));

/* ================= Schemas ================= */

const userSchema = new mongoose.Schema({
  name: String,
  email: { type: String, unique: true },
  password: String,

  games_balance: { type: Number, default: 1 },
  games_played: { type: Number, default: 0 },
  level: { type: Number, default: 1 },
  usedQuestions: { type: Array, default: [] },
  role: { type: String, default: "user" }
});

const categorySchema = new mongoose.Schema({
  section: String,
  name: String,
  image: String
});

const User = mongoose.model("User", userSchema);
const Category = mongoose.model("Category", categorySchema);

/* ================= LEVEL 1 FIXED QUESTIONS ================= */

const levelOneQuestions = [
  { category:"أعلام دول", difficulty:200, question:"ما هي الدولة التي عاصمتها مدريد؟", answer:"إسبانيا" },
  { category:"مجمعات الكويت", difficulty:200, question:"في أي منطقة يقع مجمع الأفنيوز؟", answer:"الري" },
  { category:"أعلام دول", difficulty:400, question:"ما الدولة التي يحمل علمها تنيناً أبيض؟", answer:"بوتان" },
  { category:"مجمعات الكويت", difficulty:400, question:"أي مجمع يقع في منطقة العقيلة ويطل على البحر؟", answer:"الكوت مول" },
  { category:"أعلام دول", difficulty:600, question:"ما الدولة التي يتكون علمها من مثلثين متداخلين؟", answer:"نيبال" },
  { category:"مجمعات الكويت", difficulty:600, question:"ما أول مجمع تجاري ضخم افتتح في الكويت الحديثة؟", answer:"سوق شرق" }
];

/* ================= Register ================= */

app.post("/api/register", async (req, res) => {
  try {
    const { name, email, password } = req.body;

    const existing = await User.findOne({ email });
    if (existing) {
      return res.status(400).json({ message: "المستخدم موجود مسبقاً" });
    }

    const hashed = await bcrypt.hash(password, 10);

    await User.create({
      name,
      email,
      password: hashed,
      games_balance: 1,
      games_played: 0,
      level: 1,
      usedQuestions: []
    });

    res.json({ message: "تم إنشاء الحساب" });

  } catch {
    res.status(500).json({ message: "خطأ في التسجيل" });
  }
});

/* ================= Login ================= */

app.post("/api/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ message: "المستخدم غير موجود" });
    }

    const match = await bcrypt.compare(password, user.password);
    if (!match) {
      return res.status(401).json({ message: "كلمة المرور غير صحيحة" });
    }

    res.json({
      message: "تم تسجيل الدخول",
      name: user.name,
      games_balance: user.games_balance,
      level: user.level
    });

  } catch {
    res.status(500).json({ message: "خطأ في تسجيل الدخول" });
  }
});

/* ================= Start Match (خصم رصيد) ================= */

app.post("/api/start-match", async (req, res) => {
  try {
    const { email } = req.body;

    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ message:"المستخدم غير موجود" });

    if (user.games_balance <= 0) {
      return res.status(403).json({ message:"لا يوجد رصيد ألعاب" });
    }

    user.games_balance -= 1;
    user.games_played += 1;

    if (user.games_played >= 1) {
      user.level = 2;
    }

    await user.save();

    res.json({
      message:"تم بدء المباراة",
      level:user.level,
      games_balance:user.games_balance
    });

  } catch {
    res.status(500).json({ message:"خطأ في بدء المباراة" });
  }
});

/* ================= Start Question ================= */

app.post("/api/start-game", async (req, res) => {
  try {

    const { email, category, difficulty } = req.body;

    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ message:"المستخدم غير موجود" });

    /* ===== Level 1 Fixed ===== */

    if (user.level === 1) {

      const question = levelOneQuestions.find(q =>
        q.category === category && q.difficulty == difficulty
      );

      if (question) {
        return res.json({
          question: question.question,
          answer: question.answer
        });
      }

      return res.json({
        question:"سؤال غير متوفر",
        answer:"غير متوفر"
      });
    }

    /* ===== Level 2+ OpenAI ===== */

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 1.0,
      messages: [
        {
          role: "system",
          content: "أنت كاتب أسئلة مسابقات احترافي. لا تكرر الأسئلة."
        },
        {
          role: "user",
          content: `
الفئة: ${category}
مستوى النقاط: ${difficulty}
أعد الرد بصيغة JSON فقط:
{
  "question":"...",
  "answer":"..."
}
`
        }
      ],
      response_format: { type: "json_object" }
    });

    const parsed = JSON.parse(completion.choices[0].message.content);

    res.json({
      question: parsed.question,
      answer: parsed.answer
    });

  } catch {
    res.json({
      question:"سؤال احتياطي",
      answer:"إجابة احتياطية"
    });
  }
});

/* ================= Serve ================= */

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(express.static(path.join(__dirname, "public")));

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "home.html"));
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
