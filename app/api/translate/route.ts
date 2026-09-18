import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function POST(req: NextRequest) {
  try {
    const { texts, targetLocale, targetLanguage } = await req.json();

    if (!texts || !Array.isArray(texts) || texts.length === 0) {
      return NextResponse.json({ error: "texts array is required" }, { status: 400 });
    }
    if (!targetLanguage) {
      return NextResponse.json({ error: "targetLanguage is required" }, { status: 400 });
    }

    const prompt = `You are a professional translator. Translate the following texts to ${targetLanguage}.
Return ONLY a JSON array of translated strings in the exact same order as the input. No explanations, no extra text.

Input texts:
${JSON.stringify(texts)}`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
      temperature: 0.3,
    });

    const content = completion.choices[0].message.content;
    if (!content) throw new Error("Empty response from OpenAI");

    const parsed = JSON.parse(content);
    const translations: string[] = parsed.translations ?? parsed.texts ?? Object.values(parsed);

    return NextResponse.json({ translations, targetLocale });
  } catch (err) {
    console.error("[translate]", err);
    return NextResponse.json({ error: "Translation failed" }, { status: 500 });
  }
}
