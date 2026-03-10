import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import mongoose from "mongoose";
import bcrypt from "bcrypt";
import path from "path";
import OpenAI from "openai";
import { fileURLToPath } from "url";

dotenv.config();
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});
const app = express();
app.use(cors());
app.use(express.json());

/* ================= DATABASE ================= */

mongoose.connect(process.env.MONGO_URI)
.then(() => console.log("MongoDB Connected"))
.catch(err => console.log("MongoDB Error:", err));

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
  questionImage: { type: String, default: null },
  answerImage: { type: String, default: null },
  levelRequired: { type: Number, default: 1 },
  forNewUsers: { type: Boolean, default: false },
  timesUsed: { type: Number, default: 0 },
  season: String,
  isActive: { type: Boolean, default: true }
});

const User = mongoose.models.User || mongoose.model("User", userSchema);
const Category = mongoose.models.Category || mongoose.model("Category", categorySchema);
const Question = mongoose.models.Question || mongoose.model("Question", questionSchema);

/* ================= START GAME ================= */

app.post("/api/start-game", async (req, res) => {

  try {

    const { email, category, difficulty } = req.body;

    const user = await User.findOne({ email });

    if (!user) {
      return res.status(404).json({ message: "المستخدم غير موجود" });
    }

    /* نحاول أولاً سؤال غير مستخدم */

    let question = await Question.findOne({
      category,
      difficulty,
      season: CURRENT_SEASON,
      isActive: true,
      _id: { $nin: user.usedQuestions }
    }).sort({ timesUsed: 1 });

    /* إذا لم نجد سؤال غير مستخدم */

    if (!question) {

      question = await Question.findOne({
        category,
        difficulty,
        season: CURRENT_SEASON,
        isActive: true
      }).sort({ timesUsed: 1 });

    }

    if (!question) {
      return res.status(404).json({
        message: "لا يوجد سؤال متاح"
      });
    }

    question.timesUsed += 1;
    await question.save();

    user.usedQuestions.push(question._id);
    await user.save();

    res.json({
      question: question.question,
      answer: question.answer,
      questionImage: question.questionImage || null,
      answerImage: question.answerImage || null
    });

  } catch (err) {

    console.error(err);

    res.status(500).json({
      message: "خطأ في تحميل السؤال"
    });

  }

});

/* ================= LOGIN DATA ================= */

app.post("/api/login-data", async (req, res) => {

  try {

    const { email } = req.body;

    const user = await User.findOne({ email });

    if (!user) {
      return res.status(404).json({
        message: "المستخدم غير موجود"
      });
    }

    res.json({
      games_balance: user.games_balance,
      level: user.level
    });

  } catch (err) {

    res.status(500).json({
      message: "خطأ"
    });

  }

});

/* ================= START MATCH ================= */

app.post("/api/start-match", async (req, res) => {

  try {

    const { email } = req.body;

    const user = await User.findOne({ email });

    if (!user) {
      return res.status(404).json({
        message: "المستخدم غير موجود"
      });
    }

    if (user.games_balance <= 0) {
      return res.status(403).json({
        message: "لا يوجد رصيد ألعاب"
      });
    }

    user.games_balance -= 1;
    user.games_played += 1;
    user.level = user.games_played + 1;
    user.usedQuestions = [];

    await user.save();

    res.json({
      message: "تم بدء المباراة",
      games_balance: user.games_balance,
      level: user.level
    });

  } catch (err) {

    res.status(500).json({
      message: "خطأ في بدء المباراة"
    });

  }

});

/* ================= REGISTER ================= */

app.post("/api/register", async (req, res) => {

  try {

    const { name, email, password } = req.body;

    const existing = await User.findOne({ email });

    if (existing) {
      return res.status(400).json({
        message: "المستخدم موجود مسبقاً"
      });
    }

    const hashed = await bcrypt.hash(password, 10);

    await User.create({
      name,
      email,
      password: hashed,
      games_balance: 1,
      games_played: 0,
      level: 1,
      role: "user"
    });

    res.json({
      message: "تم إنشاء الحساب"
    });

  } catch (err) {

    res.status(500).json({
      message: "خطأ في التسجيل"
    });

  }

});

/* ================= LOGIN ================= */

app.post("/api/login", async (req, res) => {

  try {

    const { email, password } = req.body;

    const user = await User.findOne({ email });

    if (!user) {
      return res.status(404).json({
        message: "المستخدم غير موجود"
      });
    }

    const match = await bcrypt.compare(password, user.password);

    if (!match) {
      return res.status(401).json({
        message: "كلمة المرور غير صحيحة"
      });
    }

    res.json({
      name: user.name,
      role: user.role,
      games_balance: user.games_balance,
      level: user.level
    });

  } catch (err) {

    res.status(500).json({
      message: "خطأ في تسجيل الدخول"
    });

  }

});

/* ================= CATEGORIES ================= */

app.get("/api/categories", async (req, res) => {

  const categories = await Category.find();
  res.json(categories);

});
/* ================= AI QUESTION GENERATOR ================= */

app.post("/api/generate-question", async (req,res)=>{

try{

const { category, difficulty } = req.body;

let level = "متوسط";let difficultyPrompt = "";

if(difficulty == 200){
difficultyPrompt = "سؤال صعب لكن يمكن حله بالتفكير.";
}

if(difficulty == 400){
difficultyPrompt = "سؤال صعب جداً يحتاج معرفة عميقة.";
}

if(difficulty == 600){
difficultyPrompt = "سؤال نادر جداً من مستوى برامج المسابقات العالمية.";
}
const prompt = `
أنشئ سؤال مسابقات شديد الصعوبة في فئة ${category}.

مستوى الصعوبة: ${level}

القواعد:
- ممنوع الأسئلة السهلة مثل العاصمة أو أسماء الحكام
- يجب أن يكون السؤال من مستوى برامج المسابقات
- يجب أن يعتمد على معلومة عميقة أو تاريخية دقيقة
- أعد النتيجة بصيغة JSON فقط

{
"question":"",
"answer":""
}
`;

const response = await openai.chat.completions.create({
model:"gpt-4.1-mini",
messages:[{role:"user",content:prompt}]
});

const text = response.choices[0].message.content;

const data = JSON.parse(text);

res.json({
question:data.question,
answer:data.answer
});

}catch(err){

console.error(err);

res.status(500).json({
message:"AI question error"
});

}

});
/* ================= ADMIN ROUTES ================= */

function checkAdmin(password){
  return password === ADMIN_MASTER_PASSWORD;
}

/* جلب المستخدمين */

app.post("/api/admin/users", async (req,res)=>{

  const { password } = req.body;

  if(!checkAdmin(password)){
    return res.status(401).json({message:"wrong password"});
  }

  const users = await User.find().select("-password");
  res.json(users);

});

/* تحديث المستخدم */

app.post("/api/admin/update-user", async (req,res)=>{

  const { password, userId, games_balance, role } = req.body;

  if(!checkAdmin(password)){
    return res.status(401).json({message:"wrong password"});
  }

  const user = await User.findById(userId);

  if(!user) return res.status(404).json({message:"user not found"});

  if(games_balance){
    user.games_balance += Number(games_balance);
  }

  if(role){
    user.role = role;
  }

  await user.save();

  res.json({message:"تم التحديث"});

});

/* حذف مستخدم */

app.post("/api/admin/delete-user", async (req,res)=>{

  const { password, userId } = req.body;

  if(!checkAdmin(password)){
    return res.status(401).json({message:"wrong password"});
  }

  await User.findByIdAndDelete(userId);

  res.json({message:"تم الحذف"});

});

/* إعادة كلمة السر */

app.post("/api/admin/reset-password", async (req,res)=>{

  const { password, userId } = req.body;

  if(!checkAdmin(password)){
    return res.status(401).json({message:"wrong password"});
  }

  const newPassword = Math.random().toString(36).slice(-8);

  const hashed = await bcrypt.hash(newPassword,10);

  await User.findByIdAndUpdate(userId,{password:hashed});

  res.json({newPassword});

});
/* ================= STATIC FILES ================= */

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(express.static(path.join(__dirname, "public")));

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "home.html"));
});

/* ================= SERVER ================= */

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
