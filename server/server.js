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
.then(() => console.log("MongoDB Connected ✅"))
.catch(err => console.log("MongoDB Error ❌", err));

/* ================= Schemas ================= */

const userSchema = new mongoose.Schema({
  name: String,
  email: { type: String, unique: true },
  password: String,
  gamesPlayed: { type: Number, default: 0 },
  gamesAllowed: { type: Number, default: 1 },
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

/* ================= Register ================= */

app.post("/api/register", async (req, res) => {
  try {
    const { name, email, password } = req.body;

    const existing = await User.findOne({ email });
    if (existing) return res.status(400).json({ message: "User exists" });

    const hashed = await bcrypt.hash(password, 10);
    await User.create({ name, email, password: hashed });

    res.json({ message: "Registered ✅", name });

  } catch {
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

  } catch {
    res.status(500).json({ message: "Login error" });
  }
});

/* ================= Categories ================= */

app.get("/api/categories", async (req, res) => {
  const categories = await Category.find();
  res.json(categories);
});

/* ================= Start Game ================= */

app.post("/api/start-game", async (req, res) => {
  try {
    const { email, section, category, difficulty } = req.body;

    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ message: "User not found" });

    if (user.gamesPlayed >= user.gamesAllowed) {
      return res.status(403).json({ message: "Purchase required" });
    }

    let question = await Question.findOne({
      section,
      category,
      difficulty
    });

    /* لو ما فيه سؤال في الداتابيس */
    if (!question) {
      return res.json({
        question: `سؤال تجريبي لفئة ${category} مستوى ${difficulty}`,
        answer: "هذه إجابة تجريبية"
      });
    }

    res.json({
      question: question.question,
      answer: question.answer
    });

  } catch (err) {
    console.log(err);
    res.status(500).json({ message: "Game error" });
  }
});

/* ================= Serve ================= */

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(express.static(path.join(__dirname, "public")));

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "login.html"));
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
