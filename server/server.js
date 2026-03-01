import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import OpenAI from "openai";
import mongoose from "mongoose";
import bcrypt from "bcrypt";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

/* ================= MongoDB ================= */

mongoose.connect(process.env.MONGO_URI)
.then(() => console.log("MongoDB Connected ✅"))
.catch(err => console.log("MongoDB Error ❌", err));

/* ================= User Schema ================= */

const userSchema = new mongoose.Schema({
  name: String,
  email: { type: String, unique: true },
  password: String,
  gamesPlayed: { type: Number, default: 0 },
  gamesAllowed: { type: Number, default: 1 }, // أول تسجيل له لعبة واحدة فقط
  isAdmin: { type: Boolean, default: false }
});

const User = mongoose.model("User", userSchema);

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
      return res.status(400).json({ message: "User already exists" });
    }

    const hashed = await bcrypt.hash(password, 10);

    const newUser = new User({
      name,
      email,
      password: hashed,
      gamesPlayed: 0,
      gamesAllowed: 1
    });

    await newUser.save();

    res.json({ message: "Registered successfully" });

  } catch (err) {
    res.status(500).json({ message: "Registration failed" });
  }
});

/* ================= Start Game ================= */

app.post("/api/play", async (req, res) => {
  try {
    const { email } = req.body;

    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ message: "User not found" });

    if (user.gamesPlayed >= user.gamesAllowed) {
      return res.status(403).json({ message: "No more plays allowed" });
    }

    user.gamesPlayed += 1;
    await user.save();

    res.json({
      message: "Game started 🎮",
      remaining: user.gamesAllowed - user.gamesPlayed
    });

  } catch (err) {
    res.status(500).json({ message: "Game start failed" });
  }
});

/* ================= Generate Question ================= */

app.post("/generate-question", async (req, res) => {
  try {
    const { category, difficulty } = req.body;

    if (!category || !difficulty) {
      return res.status(400).json({
        error: "category and difficulty are required",
      });
    }

    const prompt = `
أنت نظام توليد أسئلة احترافي.
أنشئ سؤال واحد فقط في فئة: ${category}
مستوى الصعوبة حسب النقاط: ${difficulty}

الشروط:
- سؤال واضح وقصير
- إجابة واحدة صحيحة فقط
- مناسب لمسابقة بين فريقين

أعد النتيجة بصيغة JSON فقط بالشكل التالي:

{
  "question": "نص السؤال",
  "answer": "الإجابة الصحيحة"
}
`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "أنت مساعد متخصص في إنشاء أسئلة مسابقات." },
        { role: "user", content: prompt }
      ],
      temperature: 0.7,
    });

    const content = completion.choices[0].message.content;
    const parsed = JSON.parse(content);

    res.json(parsed);

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to generate question" });
  }
});

/* ================= Root ================= */

app.get("/", (req, res) => {
  res.send("SeenMeem API Running 🚀");
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
