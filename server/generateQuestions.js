import mongoose from "mongoose";
import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

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

/* توليد دفعة 50 سؤال */

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

let data;

try{
data = JSON.parse(res.choices[0].message.content);
}catch{
console.log("JSON خطأ سيتم إعادة التوليد");
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

/* توليد حتى يصل العدد 1000 */

export async function ensureQuestions(category){

const count = await Question.countDocuments({category});

if(count >= 1000){
console.log("الفئة مكتملة:",category);
return;
}

const batches = Math.ceil((1000-count)/50);

for(let i=0;i<batches;i++){
await generateBatch(category);
}

console.log("اكتمل توليد الأسئلة للفئة:",category);

}
