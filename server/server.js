import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import OpenAI from "openai";
import mongoose from "mongoose";
import bcrypt from "bcrypt";
import path from "path";
import { fileURLToPath } from "url";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

/* ================= MongoDB ================= */

mongoose.connect(process.env.MONGO_URI)
.then(() => console.log("MongoDB Connected ✅"))
.catch(err => console.log("MongoDB Error ❌", err));

/* ================= Sections & Categories ================= */

const sections = [
  {
    name: "الكويت",
    categories: [
      "قهاوي",
      "مجسمات الكويت",
      "جيل الطيبين",
      "دعايات",
      "مجلس الأمة",
      "الكويت",
      "نفط الكويت",
      "مرور الكويت"
    ]
  },
  {
    name: "عام",
    categories: [
      "أهل البر",
      "أهل البحر",
      "ميمز",
      "AI",
      "Falcons",
      "مشاهير صغار",
      "مسابيح",
      "عالم الساعات",
      "معلومات عامة",
      "تاريخ",
      "عالم الشعر",
      "لغة وأدب",
      "منتجات",
      "شعارات",
      "عالم الحيوان",
      "تكنولوجيا",
      "طب الأسنان",
      "طب عام",
      "عطور عربية",
      "عطور عالمية"
    ]
  }
];

/* API يرجع الأقسام */
app.get("/api/sections", (req, res) => {
  res.json(sections);
});

/* ================= Schemas ================= */

const userSchema = new mongoose.Schema({
  name: String,
  email: { type: String, unique: true },
  password: String,
  gamesPlayed: { type: Number, default: 0 },
  gamesAllowed: { type: Number, default: 1 },
  usedQuestions: [{ type: mongoose.Schema.Types.ObjectId, ref: "Question" }],
  isAdmin: { type: Boolean, default: false }
});

const questionSchema = new mongoose.Schema({
  section: String,     // الكويت / عام
  category: String,    // قهاوي / تاريخ ...
  difficulty: Number,
  question: String,
  answer: String
});

const User = mongoose.model("User", userSchema);
const Question = mongoose.model("Question", questionSchema);

/* ================= OpenAI ================= */

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/* ================= Register ================= */

app.post("/api/register", async (req, res) => {
  try {
    const { name, email, password } = req.body;

    const existing = await User.findOne({ email });
    if (existing) {
      return res.status(400).json({ message: "User exists" });
    }

    const hashed = await bcrypt.hash(password, 10);

    const newUser = new User({
      name,
      email,
      password: hashed,
      gamesAllowed: 1
    });

    await newUser.save();

    res.json({ message: "Registered ✅", name });

  } catch (err) {
    res.status(500).json({ message: "Register error" });
  }
});

/* ================= Login ================= */

app.post("/api/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ message: "User not found" });

    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(401).json({ message: "Wrong password" });

    res.json({ message: "Login success ✅", name: user.name });

  } catch (err) {
    res.status(500).json({ message: "Login error" });
  }
});

/* ================= Start Game ================= */

app.post("/api/start-game", async (req, res) => {
  try {
    const { email, section, category, difficulty } = req.body;

    const user = await User.findOne({ email }).populate("usedQuestions");
    if (!user) return res.status(404).json({ message: "User not found" });

    if (user.gamesPlayed >= user.gamesAllowed) {
      return res.status(403).json({ message: "No plays left" });
    }

    let question = await Question.findOne({
      section,
      category,
      difficulty,
      _id: { $nin: user.usedQuestions }
    });

    /* إذا ما حصل سؤال يولد جديد */
    if (!question) {

      const prompt = `
أنشئ سؤال معلومات دقيق وحديث
القسم: ${section}
الفئة: ${category}
المستوى: ${difficulty}

أعد بصيغة JSON فقط:
{
 "question": "...",
 "answer": "..."
}
`;

      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: "أنت مولد أسئلة مسابقات دقيقة." },
          { role: "user", content: prompt }
        ],
        temperature: 0.7
      });

      const parsed = JSON.parse(completion.choices[0].message.content);

      question = await Question.create({
        section,
        category,
        difficulty,
        question: parsed.question,
        answer: parsed.answer
      });
    }

    user.usedQuestions.push(question._id);
    user.gamesPlayed += 1;
    await user.save();

    res.json({
      question: question.question,
      answer: question.answer
    });

  } catch (err) {
    res.status(500).json({ message: "Game error" });
  }
});

/* ================= Admin Add Plays ================= */

app.post("/api/admin/add-plays", async (req, res) => {
  try {
    const { email, amount } = req.body;

    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ message: "User not found" });

    user.gamesAllowed += Number(amount);
    await user.save();

    res.json({ message: "Plays added ✅" });

  } catch (err) {
    res.status(500).json({ message: "Admin error" });
  }
});

/* ================= Serve Frontend ================= */

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(express.static(path.join(__dirname, "public")));

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "login.html"));
});

/* ================= Server ================= */

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
