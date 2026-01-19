const DEFAULT_SETTINGS = {
  apiKey: '',
  mode: 'translate',
  targetLang: 'English',
  systemPrompt: '',
  temperature: 0.3
};

const form = document.getElementById('settings-form');
const apiKeyInput = document.getElementById('apiKey');
const modeSelect = document.getElementById('mode');
const targetLangInput = document.getElementById('targetLang');
const systemPromptInput = document.getElementById('systemPrompt');
const temperatureInput = document.getElementById('temperature');
const temperatureValue = document.getElementById('temperatureValue');
const resetButton = document.getElementById('resetDefaults');
const statusEl = document.getElementById('status');
const targetField = document.getElementById('target-language-field');

init();

function init() {
  restoreSettings();
  form.addEventListener('submit', saveSettings);
  resetButton.addEventListener('click', resetSettings);
  modeSelect.addEventListener('change', () => {
    updateTargetVisibility();
  });
  temperatureInput.addEventListener('input', () => {
    temperatureValue.textContent = temperatureInput.value;
  });
}

async function restoreSettings() {
  const stored = await storageGet(DEFAULT_SETTINGS);
  apiKeyInput.value = stored.apiKey;
  modeSelect.value = stored.mode;
  targetLangInput.value = stored.targetLang;
  systemPromptInput.value = stored.systemPrompt;
  temperatureInput.value = stored.temperature;
  temperatureValue.textContent = stored.temperature;
  updateTargetVisibility();
}

async function saveSettings(event) {
  event.preventDefault();
  const values = {
    apiKey: apiKeyInput.value.trim(),
    mode: modeSelect.value,
    targetLang: targetLangInput.value.trim() || 'English',
    systemPrompt: systemPromptInput.value.trim(),
    temperature: Number(temperatureInput.value)
  };

  await storageSet(values);
  flashStatus('Saved');
}

async function resetSettings() {
  await storageSet(DEFAULT_SETTINGS);
  await restoreSettings();
  flashStatus('Reset to defaults');
}

function updateTargetVisibility() {
  const show = modeSelect.value !== 'custom';
  targetField.style.display = show ? 'flex' : 'none';
}

function flashStatus(message, isError = false) {
  statusEl.textContent = message;
  statusEl.style.color = isError ? '#dc2626' : '#059669';
  setTimeout(() => {
    statusEl.textContent = '';
  }, 2000);
}

function storageGet(defaults) {
  return new Promise((resolve) => {
    chrome.storage.sync.get(defaults, (data) => {
      resolve(data);
    });
  });
}

function storageSet(values) {
  return new Promise((resolve) => {
    chrome.storage.sync.set(values, () => resolve());
  });
}
