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
.then(() => console.log("MongoDB Connected ✅"))
.catch(err => console.log("MongoDB Error ❌", err));

/* ================= Schemas ================= */

const userSchema = new mongoose.Schema({
  name: String,
  email: { type: String, unique: true },
  password: String,
  gamesPlayed: { type: Number, default: 0 },
  gamesAllowed: { type: Number, default: 999 },
  isAdmin: { type: Boolean, default: false }
});

const categorySchema = new mongoose.Schema({
  section: String,
  name: String,
  image: String
});

const questionSchema = new mongoose.Schema({
  section: String,
  category: String,
  difficulty: Number,
  question: String,
  answer: String
});

const User = mongoose.model("User", userSchema);
const Category = mongoose.model("Category", categorySchema);
const Question = mongoose.model("Question", questionSchema);

/* ================= Categories ================= */

app.get("/api/categories", async (req, res) => {
  const categories = await Category.find();
  res.json(categories);
});

/* ================= Question ================= */

app.post("/api/start-game", async (req, res) => {
  try {
    const { section, category, difficulty } = req.body;

    // 1️⃣ نحاول نجيب من الداتابيس
    const existing = await Question.findOne({
      section,
      category,
      difficulty
    });

    if (existing) {
      return res.json({
        question: existing.question,
        answer: existing.answer
      });
    }

    // 2️⃣ توليد من OpenAI
    const level =
      difficulty == 200 ? "سهل جداً" :
      difficulty == 400 ? "متوسط" :
      "صعب";

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: "أنت مولد أسئلة لعبة ثقافية عربية. أعد الرد JSON فقط بدون أي شرح."
        },
        {
          role: "user",
          content: `
أنشئ سؤالاً واحداً باللغة العربية.

الفئة: ${category}
مستوى الصعوبة: ${level}

أعد النتيجة بهذا الشكل فقط:
{
  "question": "نص السؤال هنا",
  "answer": "الإجابة المختصرة هنا"
}
`
        }
      ],
      temperature: 0.7
    });

    let aiText = completion.choices[0].message.content;

    // تنظيف لو رجع داخل ```json
    aiText = aiText
      .replace(/```json/g, "")
      .replace(/```/g, "")
      .trim();

    let parsed;

    try {
      parsed = JSON.parse(aiText);
    } catch (error) {
      console.log("JSON Parse Error:", aiText);
      return res.json({
        question: "حدث خطأ في توليد السؤال",
        answer: "حاول مرة أخرى"
      });
    }

    // تأكد ما يرجع undefined
    if (!parsed.question || !parsed.answer) {
      return res.json({
        question: "تعذر توليد السؤال",
        answer: "أعد المحاولة"
      });
    }

    // 3️⃣ نخزن السؤال بالمستقبل (اختياري)
    await Question.create({
      section,
      category,
      difficulty,
      question: parsed.question,
      answer: parsed.answer
    });

    res.json({
      question: parsed.question,
      answer: parsed.answer
    });

  } catch (err) {
    console.log("OpenAI Error:", err);
    res.status(500).json({ message: "Game error" });
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
