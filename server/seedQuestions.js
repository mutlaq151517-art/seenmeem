import mongoose from "mongoose";
import dotenv from "dotenv";

dotenv.config();

await mongoose.connect(process.env.MONGO_URI);

const questionSchema = new mongoose.Schema({
  category: String,
  difficulty: Number,
  question: String,
  answer: String,
  questionImage: String,
  answerImage: String,
  season: String,
  isActive: { type: Boolean, default: true }
});

const Question = mongoose.model("Question", questionSchema);

/* ===== مسح الأسئلة القديمة (اختياري) ===== */
// await Question.deleteMany({});

const questions = [

/* ================= أعلام الدول ================= */

{
category: "أعلام الدول",
difficulty: 200,
question: "ما اسم هذه الدولة؟",
questionImage: "https://flagcdn.com/w320/fr.png",
answer: "فرنسا",
answerImage: "https://flagcdn.com/w320/fr.png",
season: "season1"
},
{
category: "أعلام الدول",
difficulty: 400,
question: "ما اسم هذه الدولة؟",
questionImage: "https://flagcdn.com/w320/br.png",
answer: "البرازيل",
answerImage: "https://flagcdn.com/w320/br.png",
season: "season1"
},
{
category: "أعلام الدول",
difficulty: 600,
question: "ما اسم هذه الدولة؟",
questionImage: "https://flagcdn.com/w320/za.png",
answer: "جنوب أفريقيا",
answerImage: "https://flagcdn.com/w320/za.png",
season: "season1"
},

/* ================= عواصم ================= */

{
category: "عواصم",
difficulty: 200,
question: "ما عاصمة فرنسا؟",
answer: "باريس",
season: "season1"
},
{
category: "عواصم",
difficulty: 400,
question: "ما عاصمة البرازيل؟",
answer: "برازيليا",
season: "season1"
},
{
category: "عواصم",
difficulty: 600,
question: "ما عاصمة كندا؟",
answer: "أوتاوا",
season: "season1"
},

/* ================= الكويت ================= */

{
category: "الكويت",
difficulty: 200,
question: "في أي سنة تم استقلال الكويت؟",
answer: "1961",
season: "season1"
},
{
category: "الكويت",
difficulty: 400,
question: "ما اسم أكبر جزيرة في الكويت؟",
answer: "بوبيان",
season: "season1"
},
{
category: "الكويت",
difficulty: 600,
question: "من هو أمير الكويت الحالي؟",
answer: "الشيخ مشعل الأحمد الجابر الصباح",
season: "season1"
}

];

await Question.insertMany(questions);

console.log("✅ تم إدخال الأسئلة بنجاح");
process.exit();
