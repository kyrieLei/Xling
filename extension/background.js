const API_URL = 'https://api.deepseek.com/v1/chat/completions';
const DEFAULT_SETTINGS = {
  apiKey: '',
  mode: 'translate',
  targetLang: 'English',
  systemPrompt: '',
  temperature: 0.3
};
const MODEL = 'deepseek-chat';

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== 'translate-text') {
    return undefined;
  }

  processText(message.payload?.text)
    .then(sendResponse)
    .catch((error) => {
      sendResponse({ success: false, error: error.message });
    });

  return true; // stay open for async response
});

async function processText(rawText = '') {
  const text = (rawText || '').trim();
  if (!text) {
    return { success: false, error: 'empty-text' };
  }

  const settings = await getSettings();
  if (!settings.apiKey) {
    return { success: false, error: 'missing-api-key' };
  }

  try {
    const payload = buildRequestPayload(text, settings);
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${settings.apiKey}`
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      return { success: false, error: `http-${response.status}` };
    }

    const data = await response.json();
    const content = data?.choices?.[0]?.message?.content?.trim();
    if (!content) {
      return { success: false, error: 'no-response' };
    }

    return { success: true, translation: content };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

function buildRequestPayload(text, settings) {
  const { mode, targetLang, systemPrompt, temperature } = settings;
  const system = (systemPrompt && systemPrompt.trim()) || getDefaultSystemPrompt(mode, targetLang);
  const userContent = buildUserContent(mode, targetLang, text);

  return {
    model: MODEL,
    temperature: clampTemperature(temperature),
    max_tokens: 256,
    messages: [
      {
        role: 'system',
        content: `${system}\nAlways respond with the final text only.`
      },
      {
        role: 'user',
        content: userContent
      }
    ]
  };
}

function buildUserContent(mode, targetLang, text) {
  if (mode === 'touchup') {
    return `Improve the following ${targetLang} text while preserving its meaning and tone.\n\n${text}`;
  }
  if (mode === 'custom') {
    return text;
  }
  return `Translate the following text into ${targetLang}.\n\n${text}`;
}

function getDefaultSystemPrompt(mode, targetLang) {
  if (mode === 'touchup') {
    return `You are a writing coach that polishes ${targetLang} text for clarity, correctness, and natural tone.`;
  }
  if (mode === 'custom') {
    return 'You are a helpful assistant.';
  }
  return `You are a precise translator who outputs natural ${targetLang}.`;
}

function clampTemperature(value = 0.3) {
  if (Number.isNaN(value)) return 0.3;
  return Math.min(1, Math.max(0, Number(value)));
}

function getSettings() {
  return new Promise((resolve) => {
    chrome.storage.sync.get(DEFAULT_SETTINGS, (data) => {
      resolve(data);
    });
  });
}
