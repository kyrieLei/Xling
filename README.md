# Xling

A Chrome-compatible extension that turns any plain text box into an AI-assisted typing surface. While you type, it captures the most recent text segment, sends it to DeepSeek, and shows an inline suggestion you can insert with one click or a keyboard shortcut.

## Features

- Debounced DeepSeek requests from the background service worker, so every site can reuse the same API key without CORS issues.
- Options page where users supply their own API key, pick a scenario (translate vs.
  touch-up), set the target language, tweak temperature, or write a custom system prompt.
- Floating HUD that anchors beneath the focused control with an `Insert suggestion` button and the `Cmd+Shift+Space` (macOS) / `Ctrl+Shift+Space` (Win/Linux) shortcut.
- Safe insertion that only replaces the captured segment and re-dispatches the `input` event so apps like Gmail notice the change.

## Installation

1. Open Chrome (or any Chromium browser) and go to `chrome://extensions`.
2. Toggle on **Developer mode** (top-right).
3. Click **Load unpacked** and select the `extension/` directory from this project.
4. Pin the extension if you want the toolbar icon for quick access to the popup/settings link.

## Configuration

1. Click the Xling toolbar icon and choose **Open settings** (or visit the options page via the extensions list).
2. Paste your DeepSeek API key, but everyone should bring their own in production).
3. Pick a scenario: translate into a language, polish wording, or define completely custom instructions in the system prompt field.
4. Optionally tweak the temperature slider and target language/locale.
5. Save. The values live in `chrome.storage.sync`, so they stay on your Chrome profile only.

## Usage

1. Navigate to any site with a regular `<input>`, `<textarea>`, or a standard `contenteditable` editor (Gmail, Notion comments, etc.).
2. Start typing (Chinese, English, etc.). After a short pause (~0.5s) a HUD appears under the field with DeepSeek’s response.
3. Hit `Cmd+Shift+Space` on macOS (or `Ctrl+Shift+Space` on Windows/Linux) or click **Insert suggestion** to replace the segment you just typed. If you keep editing before accepting, the extension will ask you to retype so it can stay in sync.

## Notes & Limits

- Rich editors built with custom shadow DOM tricks might still confuse the watcher; when the overlay doesn’t appear, try another browser surface or file a bug.
- Only the last ~80 characters before the caret are sent to DeepSeek. Longer rewrites might need manual selection support.
- API calls use whichever system prompt you saved. Clear the field to fall back to the built-in translation/touch-up prompts.
- API errors (missing key, 401, 429, etc.) are surfaced inside the overlay so you can troubleshoot quickly via `chrome://extensions` → Service worker console.
