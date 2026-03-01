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
  category: String,
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

    res.json({ message: "Registered ✅" });

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
    const { email, category } = req.body;

    const user = await User.findOne({ email }).populate("usedQuestions");
    if (!user) return res.status(404).json({ message: "User not found" });

    if (user.gamesPlayed >= user.gamesAllowed) {
      return res.status(403).json({ message: "No plays left" });
    }

    const difficulties = [200,200,400,400,600,600];
    let gameQuestions = [];

    for (let diff of difficulties) {

      let question = await Question.findOne({
        category,
        difficulty: diff,
        _id: { $nin: user.usedQuestions }
      });

      if (!question) {

        const prompt = `
أنشئ سؤال واحد فقط في فئة ${category}
بمستوى ${diff}
وأعد النتيجة بصيغة JSON:
{
 "question": "...",
 "answer": "..."
}
`;

        const completion = await openai.chat.completions.create({
          model: "gpt-4o-mini",
          messages: [
            { role: "system", content: "أنت مولد أسئلة مسابقات." },
            { role: "user", content: prompt }
          ],
          temperature: 0.7
        });

        const parsed = JSON.parse(completion.choices[0].message.content);

        question = await Question.create({
          category,
          difficulty: diff,
          question: parsed.question,
          answer: parsed.answer
        });
      }

      user.usedQuestions.push(question._id);
      gameQuestions.push(question);
    }

    user.gamesPlayed += 1;
    await user.save();

    res.json({
      message: "Game Ready 🎮",
      questions: gameQuestions
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
