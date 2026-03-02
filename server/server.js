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

if (!process.env.OPENAI_API_KEY) {
  console.log("❌ OPENAI_API_KEY NOT FOUND");
}

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

/* ================= Mongo ================= */

mongoose.connect(process.env.MONGO_URI)
.then(() => console.log("MongoDB Connected ✅"))
.catch(err => console.log("MongoDB Error ❌", err));

/* ================= Schemas ================= */

const userSchema = new mongoose.Schema({
  name: String,
  email: { type: String, unique: true },
  password: String
});

const categorySchema = new mongoose.Schema({
  section: String,
  name: String,
  image: String
});

const User = mongoose.model("User", userSchema);
const Category = mongoose.model("Category", categorySchema);

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
      password: hashed
    });

    res.json({ message: "تم إنشاء الحساب ✅" });

  } catch (err) {
    console.log("Register Error:", err);
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

    res.json({ message: "تم تسجيل الدخول ✅", name: user.name });

  } catch (err) {
    console.log("Login Error:", err);
    res.status(500).json({ message: "خطأ في تسجيل الدخول" });
  }
});

/* ================= Categories ================= */

app.get("/api/categories", async (req, res) => {
  try {
    const categories = await Category.find();
    res.json(categories);
  } catch (err) {
    res.json([]);
  }
});

/* ================= Question (Always New) ================= */

app.post("/api/start-game", async (req, res) => {
  try {

    const { category, difficulty } = req.body;

    const level =
      difficulty == 200 ? "سهل جداً" :
      difficulty == 400 ? "متوسط" :
      "صعب";

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: "أنت مولد أسئلة لعبة ثقافية عربية. أعد الرد بصيغة JSON فقط."
        },
        {
          role: "user",
          content: `
أنشئ سؤالاً جديداً ومختلفاً باللغة العربية.

الفئة: ${category}
مستوى الصعوبة: ${level}

أعد النتيجة بهذا الشكل فقط:
{
  "question": "نص السؤال",
  "answer": "الإجابة المختصرة"
}
`
        }
      ],
      temperature: 0.9,
      response_format: { type: "json_object" }
    });

    const content = completion.choices[0].message.content;
    const parsed = JSON.parse(content);

    if (!parsed.question || !parsed.answer) {
      return fallbackQuestion(res);
    }

    return res.json({
      question: parsed.question,
      answer: parsed.answer
    });

  } catch (err) {
    console.log("OpenAI Error:", err?.message);
    return fallbackQuestion(res);
  }
});

/* ================= Fallback ================= */

function fallbackQuestion(res) {
  return res.json({
    question: "اذكر عاصمة دولة الكويت؟",
    answer: "مدينة الكويت"
  });
}

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
