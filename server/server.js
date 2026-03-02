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
  console.log("❌ OPENAI_API_KEY NOT FOUND IN .env");
}

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

/* ================= Mongo ================= */

mongoose.connect(process.env.MONGO_URI)
.then(() => console.log("MongoDB Connected ✅"))
.catch(err => console.log("MongoDB Error ❌", err));

/* ================= Schemas ================= */

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

    /* 1️⃣ نحاول من الداتابيس */
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

    /* 2️⃣ توليد من OpenAI */

    const level =
      difficulty == 200 ? "سهل جداً" :
      difficulty == 400 ? "متوسط" :
      "صعب";

    const response = await openai.responses.create({
      model: "gpt-4.1-mini",
      input: `
أنشئ سؤالاً واحداً باللغة العربية.

الفئة: ${category}
مستوى الصعوبة: ${level}

أعد الرد بصيغة JSON فقط هكذا:

{
  "question": "نص السؤال",
  "answer": "الإجابة المختصرة"
}
`
    });

    const output = response.output_text;

    if (!output) {
      console.log("❌ Empty OpenAI response");
      return res.json({
        question: "تعذر توليد السؤال",
        answer: "أعد المحاولة"
      });
    }

    let parsed;

    try {
      parsed = JSON.parse(output);
    } catch (err) {
      console.log("❌ JSON Parse Failed:", output);
      return res.json({
        question: "خطأ في تنسيق السؤال",
        answer: "حاول مرة أخرى"
      });
    }

    if (!parsed.question || !parsed.answer) {
      return res.json({
        question: "تعذر توليد السؤال",
        answer: "أعد المحاولة"
      });
    }

    /* 3️⃣ تخزين السؤال */
    await Question.create({
      section,
      category,
      difficulty,
      question: parsed.question,
      answer: parsed.answer
    });

    return res.json({
      question: parsed.question,
      answer: parsed.answer
    });

  } catch (err) {
    console.log("🔥 OpenAI ERROR:", err);
    return res.status(500).json({
      question: "مشكلة في توليد السؤال",
      answer: "تحقق من إعدادات السيرفر"
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
