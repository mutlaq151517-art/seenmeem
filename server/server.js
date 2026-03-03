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

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

/* ================= Mongo ================= */

mongoose.connect(process.env.MONGO_URI)
.then(() => console.log("MongoDB Connected"))
.catch(err => console.log("MongoDB Error", err));

/* ================= CURRENT SEASON ================= */

const CURRENT_SEASON = "season1";

/* ================= Schemas ================= */

const userSchema = new mongoose.Schema({
  name: String,
  email: { type: String, unique: true },
  password: String,
  games_balance: { type: Number, default: 1 },
  games_played: { type: Number, default: 0 },
  level: { type: Number, default: 1 },
  usedQuestions: { type: Array, default: [] }, // نخزن questionId
  role: { type: String, default: "user" }
});

const categorySchema = new mongoose.Schema({
  section: String,
  name: String,
  image: String
});

/* ===== NEW Question Schema ===== */

const questionSchema = new mongoose.Schema({
  category: String,
  difficulty: Number,
  question: String,
  answer: String,
  season: String,
  isActive: { type: Boolean, default: true }
});

const User = mongoose.model("User", userSchema);
const Category = mongoose.model("Category", categorySchema);
const Question = mongoose.model("Question", questionSchema);

/* ================= LEVEL 1 FIXED ================= */

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
    if (existing) return res.status(400).json({ message: "المستخدم موجود مسبقاً" });

    const hashed = await bcrypt.hash(password, 10);

    await User.create({
      name,
      email,
      password: hashed,
      games_balance: 1,
      games_played: 0,
      level: 1,
      usedQuestions: [],
      role: "user"
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
    if (!user) return res.status(404).json({ message: "المستخدم غير موجود" });

    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(401).json({ message: "كلمة المرور غير صحيحة" });

    res.json({
      name: user.name,
      games_balance: user.games_balance,
      level: user.level,
      role: user.role
    });

  } catch {
    res.status(500).json({ message: "خطأ في تسجيل الدخول" });
  }
});

/* ================= Admin: Generate Questions (Batch 100) ================= */

app.post("/api/admin/generate-questions", async (req, res) => {
  try {

    const { adminEmail } = req.body;

    const admin = await User.findOne({ email: adminEmail });
    if (!admin || admin.role !== "admin") {
      return res.status(403).json({ message: "غير مصرح" });
    }

    const categories = await Category.find();
    const BATCH_SIZE = 100;
    const TARGET = 1000;

    let results = [];

    for (const cat of categories) {

      const existing = await Question.countDocuments({
        category: cat.name,
        season: CURRENT_SEASON
      });

      if (existing >= TARGET) {
        results.push(`${cat.name} مكتملة`);
        continue;
      }

      const remaining = TARGET - existing;
      const generateNow = Math.min(BATCH_SIZE, remaining);

      const insertData = [];

      for (let i = 0; i < generateNow; i++) {

        let difficulty;
        const r = Math.random();
        if (r < 0.3) difficulty = 200;
        else if (r < 0.65) difficulty = 400;
        else difficulty = 600;

        let extra = "";
        if (cat.name === "دعايات") {
          extra = "الأسئلة يجب أن تكون عن إعلانات كويتية فقط.";
        }

        const completion = await openai.chat.completions.create({
          model: "gpt-4o-mini",
          temperature: 1,
          messages: [
            {
              role: "system",
              content: `
أنت كاتب أسئلة مسابقات احترافي جداً.
اجعل 400 صعب.
اجعل 600 صعب جداً جداً.
لا تكرر الأسئلة.
${extra}
أعد الرد بصيغة JSON فقط.
`
            },
            {
              role: "user",
              content: `
الفئة: ${cat.name}
مستوى النقاط: ${difficulty}

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

        insertData.push({
          category: cat.name,
          difficulty,
          question: parsed.question,
          answer: parsed.answer,
          season: CURRENT_SEASON
        });
      }

      await Question.insertMany(insertData);

      results.push(`${cat.name} +${generateNow}`);
    }

    res.json({ results });

  } catch (err) {
    console.log(err);
    res.status(500).json({ message: "خطأ في التوليد" });
  }
});

/* ================= Start Question ================= */

app.post("/api/start-game", async (req, res) => {
  try {

    const { email, category, difficulty } = req.body;

    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ message:"المستخدم غير موجود" });

    /* ===== Level 1 ===== */

    if (user.level === 1) {

      const question = levelOneQuestions.find(q =>
        q.category === category && q.difficulty == difficulty
      );

      if (question) {
        return res.json(question);
      }

      return res.json({
        question:"سؤال غير متوفر",
        answer:"غير متوفر"
      });
    }

    /* ===== Level 2+ (من بنك الأسئلة) ===== */

    const questions = await Question.find({
      category,
      difficulty,
      season: CURRENT_SEASON,
      _id: { $nin: user.usedQuestions }
    });

    if (questions.length === 0) {
      return res.json({
        question:"لا يوجد سؤال جديد حالياً",
        answer:"حاول لاحقاً"
      });
    }

    const random = questions[Math.floor(Math.random() * questions.length)];

    user.usedQuestions.push(random._id);
    await user.save();

    res.json({
      question: random.question,
      answer: random.answer
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
