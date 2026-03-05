import mongoose from "mongoose";
import dotenv from "dotenv";
import OpenAI from "openai";

dotenv.config();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

await mongoose.connect(process.env.MONGO_URI);

const questionSchema = new mongoose.Schema({
  category: String,
  difficulty: Number,
  question: String,
  answer: String,
  questionImage: { type: String, default: null },
  answerImage: { type: String, default: null },
  season: String,
  isActive: { type: Boolean, default: true }
});

const Question = mongoose.model("Question", questionSchema);

/* ================= توليد دفعة أسئلة ================= */

async function generateBatch(category){

const prompt = `
أنشئ 50 سؤال معلومات عامة باللغة العربية لفئة "${category}"

القواعد:
20 سؤال سهل difficulty=200
15 سؤال متوسط difficulty=400
15 سؤال صعب جداً difficulty=600

أعد النتيجة JSON فقط بهذا الشكل:

[
{
"question":"السؤال",
"answer":"الجواب",
"difficulty":200
}
]
`;

const res = await openai.chat.completions.create({
model:"gpt-4.1-mini",
messages:[{ role:"user", content:prompt }]
});

const text = res.choices[0].message.content;

let data;

try{
data = JSON.parse(text);
}catch(e){
console.log("خطأ في JSON سيتم إعادة التوليد");
return;
}

for(const q of data){

const exists = await Question.findOne({
category:category,
question:q.question
});

if(!exists){

await Question.create({
category:category,
difficulty:q.difficulty,
question:q.question,
answer:q.answer,
season:"season1"
});

}

}

console.log("دفعة جديدة للفئة:",category);

}

/* ================= توليد 1000 سؤال ================= */

async function generate1000(category){

for(let i=0;i<20;i++){

await generateBatch(category);

}

console.log("تم إنشاء 1000 سؤال للفئة:",category);

}

/* ================= الفئات ================= */

await generate1000("التاريخ");
await generate1000("كرة القدم");
await generate1000("السينما");
await generate1000("المسلسلات");
await generate1000("الجغرافيا");

console.log("تم توليد جميع الأسئلة");

process.exit();
