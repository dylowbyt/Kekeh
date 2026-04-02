import OpenAI from 'openai';

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const SYSTEM_PROMPT =
  process.env.BOT_PERSONALITY ||
  'Kamu adalah asisten AI yang ramah, helpful, dan berbicara dalam Bahasa Indonesia. Jawab dengan singkat, padat, dan jelas. Gunakan emoji secukupnya.';

export async function getAIResponse(userMessage, history = [], userId = '') {
  try {
    const messages = [
      { role: 'system', content: SYSTEM_PROMPT },
      ...history,
      { role: 'user', content: userMessage },
    ];

    const response = await client.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      messages,
      max_tokens: 1000,
      temperature: 0.8,
    });

    const reply = response.choices[0]?.message?.content?.trim();
    if (!reply) throw new Error('Empty response from OpenAI');

    console.log(`💬 [${userId.slice(0,15)}] ${userMessage.slice(0,40)}...`);
    return reply;
  } catch (err) {
    console.error('❌ OpenAI Error:', err?.message || err);
    if (err?.status === 429) return '⚠️ Bot sedang sibuk, coba lagi sebentar lagi!';
    if (err?.status === 401) return '❌ API Key OpenAI tidak valid. Hubungi admin.';
    return '😅 Maaf, terjadi kesalahan. Coba lagi nanti ya!';
  }
}
