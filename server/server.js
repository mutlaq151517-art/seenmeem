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

/* ================= ADMIN MASTER LOGIN ================= */

app.post("/api/admin/master-login", async (req, res) => {
  try {
    const { password } = req.body;

    if (!ADMIN_MASTER_PASSWORD) {
      return res.status(500).json({ message: "ADMIN_MASTER_PASSWORD غير معرف" });
    }

    if (password !== ADMIN_MASTER_PASSWORD) {
      return res.status(401).json({ message: "كلمة السر غير صحيحة" });
    }

    res.json({ success: true });

  } catch {
    res.status(500).json({ message: "خطأ في تسجيل دخول المدير" });
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

/* ================= ADMIN: USERS ================= */

app.post("/api/admin/users", async (req, res) => {
  try {
    const { email } = req.body;

    const admin = await User.findOne({ email });
    if (!admin || admin.role !== "admin") {
      return res.status(403).json({ message: "غير مصرح" });
    }

    const users = await User.find().select("-password");
    res.json(users);

  } catch {
    res.status(500).json({ message: "خطأ في جلب المستخدمين" });
  }
});

/* ================= ADMIN: UPDATE BALANCE ================= */

app.post("/api/admin/update-balance", async (req, res) => {
  try {
    const { adminEmail, userEmail, balance } = req.body;

    const admin = await User.findOne({ email: adminEmail });
    if (!admin || admin.role !== "admin") {
      return res.status(403).json({ message: "غير مصرح" });
    }

    await User.updateOne(
      { email: userEmail },
      { games_balance: Number(balance) }
    );

    res.json({ message: "تم تعديل الرصيد" });

  } catch {
    res.status(500).json({ message: "خطأ في تعديل الرصيد" });
  }
});

/* ================= ADMIN: CHANGE ROLE ================= */

app.post("/api/admin/change-role", async (req, res) => {
  try {
    const { adminEmail, userEmail, role } = req.body;

    const admin = await User.findOne({ email: adminEmail });
    if (!admin || admin.role !== "admin") {
      return res.status(403).json({ message: "غير مصرح" });
    }

    await User.updateOne({ email: userEmail }, { role });

    res.json({ message: "تم تغيير الصلاحية" });

  } catch {
    res.status(500).json({ message: "خطأ في تغيير الصلاحية" });
  }
});

/* ================= CATEGORIES ================= */

app.get("/api/categories", async (req, res) => {
  try {
    const categories = await Category.find();
    res.json(categories);
  } catch {
    res.json([]);
  }
});

app.post("/api/admin/add-category", async (req, res) => {
  try {
    const { email, section, name, image } = req.body;

    const admin = await User.findOne({ email });
    if (!admin || admin.role !== "admin") {
      return res.status(403).json({ message: "غير مصرح" });
    }

    const exists = await Category.findOne({ name });
    if (exists) return res.status(400).json({ message: "الفئة موجودة مسبقاً" });

    await Category.create({ section, name, image });

    res.json({ message: "تمت إضافة الفئة" });

  } catch {
    res.status(500).json({ message: "خطأ في إضافة الفئة" });
  }
});

app.post("/api/admin/delete-category", async (req, res) => {
  try {
    const { email, id } = req.body;

    const admin = await User.findOne({ email });
    if (!admin || admin.role !== "admin") {
      return res.status(403).json({ message: "غير مصرح" });
    }

    await Category.findByIdAndDelete(id);

    res.json({ message: "تم حذف الفئة" });

  } catch {
    res.status(500).json({ message: "خطأ في الحذف" });
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
