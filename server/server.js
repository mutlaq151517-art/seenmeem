import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import mongoose from "mongoose";
import path from "path";
import { fileURLToPath } from "url";
import OpenAI from "openai";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

/* ================= OpenAI ================= */

if (!process.env.OPENAI_API_KEY) {
  console.log("❌ OPENAI_API_KEY NOT FOUND IN RENDER ENV");
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
  try {
    const categories = await Category.find();
    res.json(categories);
  } catch (err) {
    console.log("Categories Error:", err);
    res.json([]);
  }
});

/* ================= Question ================= */

app.post("/api/start-game", async (req, res) => {
  try {

    const { section, category, difficulty } = req.body;

    /* 1️⃣ من الداتابيس */
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
أنشئ سؤالاً واحداً باللغة العربية.

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
      temperature: 0.7,
      response_format: { type: "json_object" }
    });

    const parsed = completion.choices[0].message;

    if (!parsed || !parsed.question || !parsed.answer) {
      console.log("⚠️ OpenAI returned empty object");
      return fallbackQuestion(res);
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

    console.log("🔥 OPENAI ERROR:", err?.message);

    return fallbackQuestion(res);
  }
});

/* ================= Fallback Question ================= */

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
