import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import OpenAI from "openai";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/*
========================================
Generate Questions Endpoint
========================================
Body:
{
  category: "اسلامي",
  difficulty: 200
}
========================================
*/

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
- لا تكرر نفس السؤال سابقاً
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

app.get("/", (req, res) => {
  res.send("SeenMeem AI Server Running 🚀");
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
