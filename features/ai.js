import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const SYSTEM = process.env.BOT_PERSONALITY ||
  'Kamu adalah asisten AI yang ramah dan helpful. Berbicara Bahasa Indonesia. Jawab singkat dan jelas. Pakai emoji secukupnya.';

export async function getAIResponse(text, history = [], userId = '') {
  try {
    const res = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      messages: [{ role: 'system', content: SYSTEM }, ...history, { role: 'user', content: text }],
      max_tokens: 1000,
      temperature: 0.8,
    });
    const reply = res.choices[0]?.message?.content?.trim();
    if (!reply) throw new Error('empty response');
    console.log(`💬 [${userId.slice(0,10)}] ${text.slice(0,30)}`);
    return reply;
  } catch (e) {
    console.error('OpenAI error:', e?.message);
    if (e?.status === 429) return '⚠️ Bot lagi sibuk, coba lagi sebentar!';
    if (e?.status === 401) return '❌ API Key tidak valid!';
    return '😅 Maaf ada error, coba lagi ya!';
  }
}
