function systemPrompt(config) {
  return `You are Nekz, an AI assistant replying on behalf of ${config.ownerName} in a WhatsApp conversation. Be natural, concise, and context-aware. Never claim to be ${config.ownerName}. Avoid making commitments about money, schedules, or private information. If unsure, ask one brief question.`;
}

async function generateReply(config, { text, history = [] }, fetchImpl = fetch) {
  const provider = config.aiProvider || 'gemini';
  if (provider === 'openai') {
    if (!config.openaiApiKey) throw new Error('OPENAI_API_KEY is not configured');
    const response = await fetchImpl(`${config.openaiBaseUrl.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST', headers: { Authorization: `Bearer ${config.openaiApiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: config.openaiModel, temperature: 0.7, max_tokens: 300, messages: [
        { role: 'system', content: systemPrompt(config) },
        ...history.map(item => ({ role: item.role === 'assistant' ? 'assistant' : 'user', content: item.text })),
        { role: 'user', content: text }
      ] }), signal: AbortSignal.timeout(30000)
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error?.message || `OpenAI returned ${response.status}`);
    const answer = data.choices?.[0]?.message?.content?.trim();
    if (!answer) throw new Error('AI returned an empty answer');
    return answer.slice(0, 3500);
  }
  if (!config.geminiApiKey) throw new Error('GEMINI_API_KEY is not configured');
  const contents = [...history.map(item => ({ role: item.role === 'assistant' ? 'model' : 'user', parts: [{ text: item.text }] })), { role: 'user', parts: [{ text }] }];
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(config.geminiModel)}:generateContent?key=${encodeURIComponent(config.geminiApiKey)}`;
  const response = await fetchImpl(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ systemInstruction: { parts: [{ text: systemPrompt(config) }] }, contents, generationConfig: { temperature: 0.7, maxOutputTokens: 500 } }), signal: AbortSignal.timeout(30000) });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error?.message || `Gemini returned ${response.status}`);
  const answer = data.candidates?.[0]?.content?.parts?.map(part => part.text || '').join('').trim();
  if (!answer) throw new Error('AI returned an empty answer');
  return answer.slice(0, 3500);
}
module.exports = { generateReply, systemPrompt };
