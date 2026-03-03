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

mongoose.connect(process.env.MONGO_URI)
.then(() => console.log("MongoDB Connected"))
.catch(err => console.log("MongoDB Error", err));

const ADMIN_MASTER_PASSWORD = process.env.ADMIN_MASTER_PASSWORD;

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

/* ================= ADMIN AUTH CHECK ================= */

function checkAdmin(password) {
  return password === ADMIN_MASTER_PASSWORD;
}

/* ================= ADMIN: USERS ================= */

app.post("/api/admin/users", async (req, res) => {
  try {
    const { password } = req.body;

    if (!checkAdmin(password)) {
      return res.status(403).json({ message: "غير مصرح" });
    }

    const users = await User.find().select("-password");
    res.json(users);

  } catch {
    res.status(500).json([]);
  }
});

app.post("/api/admin/update-user", async (req, res) => {
  try {
    const { password, userId, games_balance, role } = req.body;

    if (!checkAdmin(password)) {
      return res.status(403).json({ message: "غير مصرح" });
    }

    await User.findByIdAndUpdate(userId, {
      games_balance,
      role
    });

    res.json({ message: "تم التحديث" });

  } catch {
    res.status(500).json({ message: "خطأ" });
  }
});

app.post("/api/admin/reset-password", async (req, res) => {
  try {
    const { password, userId } = req.body;

    if (!checkAdmin(password)) {
      return res.status(403).json({ message: "غير مصرح" });
    }

    const newPassword = Math.random().toString(36).slice(-8);
    const hashed = await bcrypt.hash(newPassword, 10);

    await User.findByIdAndUpdate(userId, { password: hashed });

    res.json({ newPassword });

  } catch {
    res.status(500).json({ message: "خطأ" });
  }
});

app.post("/api/admin/delete-user", async (req, res) => {
  try {
    const { password, userId } = req.body;

    if (!checkAdmin(password)) {
      return res.status(403).json({ message: "غير مصرح" });
    }

    await User.findByIdAndDelete(userId);
    res.json({ message: "تم الحذف" });

  } catch {
    res.status(500).json({ message: "خطأ" });
  }
});

/* ================= Categories ================= */

app.get("/api/categories", async (req, res) => {
  try {
    const categories = await Category.find();
    res.json(categories);
  } catch {
    res.status(500).json([]);
  }
});

/* ================= START GAME (الإضافة المهمة) ================= */

app.post("/api/start-game", async (req, res) => {
  try {
    const { email, category, difficulty } = req.body;

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ message: "المستخدم غير موجود" });
    }

    const question = await Question.findOne({
      category: category,
      difficulty: difficulty,
      season: CURRENT_SEASON,
      isActive: true
    });

    if (!question) {
      return res.status(404).json({ message: "لا يوجد سؤال" });
    }

    res.json({
      question: question.question,
      answer: question.answer
    });

  } catch (err) {
    res.status(500).json({ message: "خطأ في تحميل السؤال" });
  }
});

/* ================= START MATCH ================= */

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
    user.level = user.games_played + 1;

    await user.save();

    res.json({
      message: "تم بدء المباراة",
      games_balance: user.games_balance,
      level: user.level
    });

  } catch {
    res.status(500).json({ message: "خطأ في بدء المباراة" });
  }
});

/* ================= Register ================= */

app.post("/api/register", async (req, res) => {
  try {
    const { name, email, password } = req.body;

    const existing = await User.findOne({ email });
    if (existing) return res.status(400).json({ message: "المستخدم موجود مسبقاً" });

    const hashed = await bcrypt.hash(password, 10);
    await User.create({ name, email, password: hashed });

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
      role: user.role,
      games_balance: user.games_balance
    });
  } catch {
    res.status(500).json({ message: "خطأ في تسجيل الدخول" });
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
