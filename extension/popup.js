const STATUS_DEFAULTS = {
  apiKey: '',
  mode: 'translate',
  targetLang: 'English'
};

const statusEl = document.getElementById('status');
const openButton = document.getElementById('open-options');

openButton.addEventListener('click', () => {
  if (chrome.runtime.openOptionsPage) {
    chrome.runtime.openOptionsPage();
  } else {
    window.open(chrome.runtime.getURL('options.html'));
  }
});

chrome.storage.sync.get(STATUS_DEFAULTS, (data) => {
  if (!data.apiKey) {
    statusEl.textContent = 'API key missing. Open settings to add your DeepSeek key.';
    statusEl.style.color = '#dc2626';
    return;
  }
  const scenario = describeScenario(data);
  statusEl.textContent = `Ready – ${scenario}.`;
  statusEl.style.color = '#059669';
});

function describeScenario({ mode, targetLang }) {
  if (mode === 'touchup') {
    return `touching up ${targetLang} prose`;
  }
  if (mode === 'custom') {
    return 'using your custom system prompt';
  }
  return `translating into ${targetLang}`;
}
