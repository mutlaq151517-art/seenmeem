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

let CURRENT_SEASON = "season1";

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

/* ================= Admin: Progress ================= */

app.post("/api/admin/questions-progress", async (req, res) => {
  try {
    const { adminEmail } = req.body;

    const admin = await User.findOne({ email: adminEmail });
    if (!admin || admin.role !== "admin") {
      return res.status(403).json({ message: "غير مصرح" });
    }

    const categories = await Category.find();
    let result = [];

    for (const cat of categories) {
      const count = await Question.countDocuments({
        category: cat.name,
        season: CURRENT_SEASON
      });

      result.push({
        category: cat.name,
        count
      });
    }

    res.json(result);

  } catch {
    res.status(500).json({ message: "خطأ في التقدم" });
  }
});

/* ================= Admin: Start New Season ================= */

app.post("/api/admin/new-season", async (req, res) => {
  try {
    const { adminEmail, seasonName } = req.body;

    const admin = await User.findOne({ email: adminEmail });
    if (!admin || admin.role !== "admin") {
      return res.status(403).json({ message: "غير مصرح" });
    }

    CURRENT_SEASON = seasonName;

    // تصفير سجل الأسئلة للمستخدمين
    await User.updateMany({}, { usedQuestions: [] });

    res.json({ message: "تم بدء موسم جديد", season: CURRENT_SEASON });

  } catch {
    res.status(500).json({ message: "خطأ في تغيير الموسم" });
  }
});

/* ================= Start Question ================= */

app.post("/api/start-game", async (req, res) => {
  try {

    const { email, category, difficulty } = req.body;

    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ message:"المستخدم غير موجود" });

    if (user.level === 1) {
      const question = levelOneQuestions.find(q =>
        q.category === category && q.difficulty == difficulty
      );

      if (question) return res.json(question);

      return res.json({ question:"سؤال غير متوفر", answer:"غير متوفر" });
    }

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
