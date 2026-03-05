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

async function generate(category){

const prompt = `
أنشئ 50 سؤال معلومات عامة باللغة العربية لفئة "${category}"

القواعد:
- 20 سؤال سهل (200)
- 15 سؤال متوسط (400)
- 15 سؤال صعب جدا (600)

النتيجة يجب أن تكون JSON فقط بالشكل:

[
{
"question":"السؤال",
"answer":"الجواب",
"difficulty":200
}
]
`;

const res = await openai.chat.completions.create({
model: "gpt-4.1-mini",
messages: [{ role:"user", content:prompt }]
});

const text = res.choices[0].message.content;

const data = JSON.parse(text);

for(const q of data){

await Question.create({
category: category,
difficulty: q.difficulty,
question: q.question,
answer: q.answer,
season:"season1"
});

}

console.log("تم إنشاء أسئلة لفئة:",category);
}

await generate("التاريخ");
await generate("كرة القدم");
await generate("السينما");
await generate("المسلسلات");
await generate("الجغرافيا");

console.log("تم توليد الأسئلة");

process.exit();
