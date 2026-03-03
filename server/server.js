import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import mongoose from "mongoose";
import bcrypt from "bcrypt";
import path from "path";
import { fileURLToPath } from "url";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

/* ================= Mongo ================= */

mongoose.connect(process.env.MONGO_URI)
.then(() => console.log("MongoDB Connected"))
.catch(err => console.log("MongoDB Error", err));

/* ================= ADMIN MASTER PASSWORD ================= */

const ADMIN_MASTER_PASSWORD = process.env.ADMIN_MASTER_PASSWORD;

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
  usedQuestions: { type: Array, default: [] },
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

/* ================= Categories ================= */

// جلب الفئات
app.get("/api/categories", async (req, res) => {
  try {
    const categories = await Category.find();
    res.json(categories);
  } catch {
    res.status(500).json([]);
  }
});

// إضافة فئة (مدير)
app.post("/api/admin/add-category", async (req, res) => {
  try {
    const { email, section, name, image } = req.body;

    const user = await User.findOne({ email });
    if (!user || user.role !== "admin") {
      return res.status(403).json({ message: "غير مصرح" });
    }

    await Category.create({ section, name, image });

    res.json({ message: "تمت الإضافة" });

  } catch {
    res.status(500).json({ message: "خطأ في الإضافة" });
  }
});

// حذف فئة
app.post("/api/admin/delete-category", async (req, res) => {
  try {
    const { email, id } = req.body;

    const user = await User.findOne({ email });
    if (!user || user.role !== "admin") {
      return res.status(403).json({ message: "غير مصرح" });
    }

    await Category.findByIdAndDelete(id);

    res.json({ message: "تم الحذف" });

  } catch {
    res.status(500).json({ message: "خطأ في الحذف" });
  }
});

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
      password: hashed
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
      role: user.role
    });

  } catch {
    res.status(500).json({ message: "خطأ في تسجيل الدخول" });
  }
});

/* ================= Start Match ================= */

app.post("/api/start-match", async (req, res) => {
  try {
    const { email } = req.body;

    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ message: "المستخدم غير موجود" });

    if (user.games_balance <= 0) {
      return res.status(403).json({ message: "لا يوجد رصيد ألعاب" });
    }

    user.games_balance -= 1;
    user.games_played += 1;
    await user.save();

    res.json({ message: "تم بدء المباراة" });

  } catch {
    res.status(500).json({ message: "خطأ في بدء المباراة" });
  }
});

/* ================= Start Question ================= */

app.post("/api/start-game", async (req, res) => {
  try {
    const { email, category, difficulty } = req.body;

    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ message:"المستخدم غير موجود" });

    const questions = await Question.find({
      category,
      difficulty,
      season: CURRENT_SEASON,
      _id: { $nin: user.usedQuestions }
    });

    if (!questions.length) {
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
