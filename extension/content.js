(() => {
  const DEBOUNCE_MS = 500;
  const MAX_SEGMENT_LENGTH = 80;
  const CJK_SEGMENT_REGEX = /([\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]+)$/;
  const WORD_SEGMENT_REGEX = /([\p{L}\p{N}\s,'"-]+)$/u;
  const IS_MAC = /Mac|iPhone|iPad|iPod/i.test(navigator.platform);
  const ACCEPT_KEY_LABEL = IS_MAC ? 'Cmd+Shift+Space' : 'Ctrl+Shift+Space';

  const state = {
    activeField: null,
    activeType: null,
    debounceTimer: null,
    requestId: 0,
    lastCandidate: null,
    overlay: createOverlay()
  };

  function isTextControl(el) {
    if (!el) return false;
    if (el instanceof HTMLTextAreaElement) return true;
    if (el instanceof HTMLInputElement) {
      const allowedTypes = ['text', 'search', 'url', 'tel', 'email'];
      return allowedTypes.includes(el.type || 'text');
    }
    return false;
  }

  function isContentEditableElement(el) {
    return Boolean(el && el.isContentEditable);
  }

  function resolveEditableTarget(target) {
    if (!target) return null;
    if (target.nodeType === Node.TEXT_NODE) {
      target = target.parentElement;
    }
    if (!target) return null;
    if (isTextControl(target) || isContentEditableElement(target)) {
      return target;
    }
    if (typeof target.closest !== 'function') {
      return null;
    }
    const editableAncestor = target.closest('textarea, input[type="text"], input[type="search"], input[type="url"], input[type="tel"], input[type="email"], [contenteditable], [contenteditable="true"], [contenteditable="plaintext-only"]');
    if (!editableAncestor) {
      return null;
    }
    if (
      editableAncestor.hasAttribute('contenteditable') &&
      editableAncestor.getAttribute('contenteditable') === 'false'
    ) {
      return null;
    }
    return editableAncestor;
  }

  function setActiveField(target) {
    state.activeField = target;
    state.activeType = target
      ? (isContentEditableElement(target) ? 'contenteditable' : 'text')
      : null;
  }

  function clearActiveField() {
    state.activeField = null;
    state.activeType = null;
    state.lastCandidate = null;
    if (state.debounceTimer) {
      clearTimeout(state.debounceTimer);
      state.debounceTimer = null;
    }
    hideOverlay();
  }

  function attachListeners() {
    document.addEventListener('focusin', handleFocus, true);
    document.addEventListener('focusout', handleBlur, true);
    document.addEventListener('input', handleInput, true);
    document.addEventListener('keydown', handleKeydown, true);
    document.addEventListener('selectionchange', handleSelectionChange, true);
    window.addEventListener('scroll', repositionOverlay, true);
    window.addEventListener('resize', repositionOverlay);
  }

  function handleSelectionChange() {
    if (!state.activeField || state.activeType !== 'contenteditable') {
      return;
    }
    const selection = window.getSelection();
    if (!selection || !selection.rangeCount) {
      return;
    }
    const anchor = selection.anchorNode;
    if (!anchor || !state.activeField.contains(anchor)) {
      return;
    }
    repositionOverlay();
  }

  function handleFocus(event) {
    const target = resolveEditableTarget(event.target);
    if (!target) {
      clearActiveField();
      return;
    }
    setActiveField(target);
    state.lastCandidate = null;
    state.debounceTimer && clearTimeout(state.debounceTimer);
    setStatus('Type to get AI suggestions');
    showOverlay();
    repositionOverlay();
  }

  function handleBlur(event) {
    const target = resolveEditableTarget(event.target);
    if (target && target === state.activeField) {
      clearActiveField();
    }
  }

  function handleInput(event) {
    if (!state.activeField) {
      return;
    }
    const target = resolveEditableTarget(event.target);
    if (!target || target !== state.activeField) {
      return;
    }
    scheduleTranslation();
  }

  function handleKeydown(event) {
    if (!state.activeField) return;
    if (isAcceptShortcut(event)) {
      if (state.lastCandidate?.translation) {
        event.preventDefault();
        insertTranslation();
      }
    }
  }

  function isAcceptShortcut(event) {
    const primaryKey = IS_MAC ? event.metaKey : event.ctrlKey;
    return (
      primaryKey &&
      event.shiftKey &&
      (event.code === 'Space' || event.key === ' ' || event.key === 'Spacebar')
    );
  }

  function scheduleTranslation() {
    state.debounceTimer && clearTimeout(state.debounceTimer);
    state.debounceTimer = setTimeout(() => {
      const segment = getActiveSegment();
      if (!segment || !shouldTranslate(segment.text)) {
        setStatus('Type to get AI suggestions');
        state.lastCandidate = null;
        return;
      }
      requestTranslation(segment);
    }, DEBOUNCE_MS);
  }

  function getActiveSegment() {
    if (!state.activeField) {
      return null;
    }
    if (state.activeType === 'contenteditable') {
      return getContentEditableSegment(state.activeField);
    }
    return getTextControlSegment(state.activeField);
  }

  function getTextControlSegment(field) {
    const value = field.value || '';
    const caret = field.selectionStart ?? value.length;
    const previewStart = Math.max(0, caret - MAX_SEGMENT_LENGTH);
    const preview = value.slice(previewStart, caret);
    const match = extractSegmentFromPreview(preview);
    if (!match) return null;
    const start = previewStart + match.localStart;
    const end = previewStart + match.localEnd;
    return { text: match.text, start, end, kind: 'text' };
  }

  function getContentEditableSegment(field) {
    const selection = window.getSelection();
    if (!selection || !selection.rangeCount) return null;
    const caretRange = selection.getRangeAt(0);
    if (!caretRange.collapsed) return null;
    if (!field.contains(caretRange.startContainer)) return null;
    const textBefore = getTextBeforeCaret(field, caretRange);
    const preview = textBefore.slice(Math.max(0, textBefore.length - MAX_SEGMENT_LENGTH));
    const match = extractSegmentFromPreview(preview);
    if (!match) return null;
    const segmentRange = caretRange.cloneRange();
    if (!expandRangeBackward(segmentRange, match.text.length, field)) {
      return null;
    }
    return { text: match.text, kind: 'contenteditable', range: segmentRange };
  }

  function shouldTranslate(text) {
    return Boolean(text && text.trim().length >= 2);
  }

  function extractSegmentFromPreview(preview) {
    if (!preview) return null;
    const cjkMatch = preview.match(CJK_SEGMENT_REGEX);
    if (cjkMatch) {
      const text = cjkMatch[1];
      const localStart = preview.length - text.length;
      return { text, localStart, localEnd: preview.length };
    }
    const generalMatch = preview.match(WORD_SEGMENT_REGEX);
    if (!generalMatch) return null;
    const raw = generalMatch[1];
    const trimmed = raw.trim();
    if (!trimmed) return null;
    const leadingWhitespace = raw.length - raw.trimStart().length;
    const trailingWhitespace = raw.length - raw.trimEnd().length;
    const localStart = preview.length - raw.length + leadingWhitespace;
    const localEnd = preview.length - trailingWhitespace;
    return { text: trimmed, localStart, localEnd };
  }

  function getTextBeforeCaret(root, caretRange) {
    const probe = document.createRange();
    probe.selectNodeContents(root);
    probe.setEnd(caretRange.startContainer, caretRange.startOffset);
    return probe.toString();
  }

  function requestTranslation(segment) {
    state.requestId += 1;
    const currentRequest = state.requestId;
    setStatus('Translating...');
    chrome.runtime.sendMessage({
      type: 'translate-text',
      payload: {
        text: segment.text
      }
    }, (response) => {
      if (chrome.runtime.lastError) {
        setStatus('Service worker unavailable');
        return;
      }
      if (currentRequest !== state.requestId) {
        return;
      }
      if (!response || !response.success) {
        state.lastCandidate = null;
        setStatus(mapError(response?.error));
        return;
      }
      state.lastCandidate = {
        segment,
        translation: response.translation
      };
      setTranslation(response.translation);
    });
  }

  function setTranslation(text) {
    state.overlay.translation.textContent = text;
    state.overlay.translation.title = text;
    state.overlay.cta.classList.remove('hidden');
    state.overlay.hint.textContent = `Press ${ACCEPT_KEY_LABEL} or use the button to insert`;
    repositionOverlay();
  }

  function setStatus(text) {
    state.overlay.translation.textContent = text;
    state.overlay.translation.title = '';
    state.overlay.cta.classList.add('hidden');
    state.overlay.hint.textContent = '';
    repositionOverlay();
  }

  function mapError(code) {
    switch (code) {
      case 'missing-api-key':
        return 'Add your DeepSeek key in settings';
      case 'empty-text':
        return 'Type to get AI suggestions';
      case 'http-401':
        return 'DeepSeek rejected the API key';
      case 'http-429':
        return 'DeepSeek rate limited the request';
      case 'no-response':
        return 'No text returned';
      default:
        return 'Translation unavailable';
    }
  }

  function insertTranslation() {
    if (!state.lastCandidate || !state.activeField) {
      return;
    }
    if (state.activeType === 'contenteditable') {
      insertIntoContentEditable(state.lastCandidate);
    } else {
      insertIntoTextControl(state.lastCandidate);
    }
  }

  function insertIntoTextControl(candidate) {
    const { translation, segment } = candidate;
    const field = state.activeField;
    const value = field.value || '';
    const resolved = resolveSegmentPosition(value, segment);
    if (!resolved) {
      setStatus('Text changed, retype to regenerate');
      return;
    }
    const before = value.slice(0, resolved.start);
    const after = value.slice(resolved.end);
    const needsSpace = after.length && !/^\s/.test(after);
    const insertValue = translation + (needsSpace ? ' ' : '');
    const nextValue = `${before}${insertValue}${after}`;
    field.value = nextValue;
    const cursor = before.length + insertValue.length;
    field.focus();
    field.setSelectionRange(cursor, cursor);
    field.dispatchEvent(new Event('input', { bubbles: true }));
    setStatus('Inserted suggestion');
    state.lastCandidate = null;
  }

  function insertIntoContentEditable(candidate) {
    const { translation, segment } = candidate;
    const field = state.activeField;
    if (!segment?.range || !field.contains(segment.range.startContainer)) {
      setStatus('Text changed, retype to regenerate');
      return;
    }
    const range = segment.range;
    const currentText = range.toString();
    if (currentText !== segment.text) {
      setStatus('Text changed, retype to regenerate');
      return;
    }
    const addSpace = needsSpaceAfterRange(range, field);
    const insertValue = translation + (addSpace ? ' ' : '');
    const textNode = document.createTextNode(insertValue);
    range.deleteContents();
    range.insertNode(textNode);
    const cursor = document.createRange();
    cursor.setStart(textNode, textNode.textContent.length);
    cursor.collapse(true);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(cursor);
    field.dispatchEvent(new Event('input', { bubbles: true }));
    setStatus('Inserted suggestion');
    state.lastCandidate = null;
  }

  function resolveSegmentPosition(currentValue, segment) {
    if (!segment) return null;
    if (currentValue.slice(segment.start, segment.end) === segment.text) {
      return segment;
    }
    const idx = currentValue.lastIndexOf(segment.text);
    if (idx === -1) {
      return null;
    }
    return {
      text: segment.text,
      start: idx,
      end: idx + segment.text.length
    };
  }

  function expandRangeBackward(range, characters, root) {
    let remaining = characters;
    while (remaining > 0) {
      if (range.startContainer.nodeType === Node.TEXT_NODE) {
        const available = range.startOffset;
        if (available >= remaining) {
          range.setStart(range.startContainer, range.startOffset - remaining);
          return true;
        }
        remaining -= available;
        range.setStart(range.startContainer, 0);
      }
      const previousNode = getPreviousTextNode(range.startContainer, root);
      if (!previousNode) {
        return false;
      }
      range.setStart(previousNode, previousNode.textContent.length);
    }
    return true;
  }

  function expandRangeForward(range, characters, root) {
    let remaining = characters;
    while (remaining > 0) {
      if (range.endContainer.nodeType === Node.TEXT_NODE) {
        const available = range.endContainer.textContent.length - range.endOffset;
        if (available >= remaining) {
          range.setEnd(range.endContainer, range.endOffset + remaining);
          return true;
        }
        remaining -= available;
        range.setEnd(range.endContainer, range.endContainer.textContent.length);
      }
      const nextNode = getNextTextNode(range.endContainer, root);
      if (!nextNode) {
        return false;
      }
      range.setEnd(nextNode, 0);
    }
    return true;
  }

  function getPreviousTextNode(node, root) {
    let current = node;
    while (current && current !== root) {
      if (current.previousSibling) {
        current = current.previousSibling;
        while (current.lastChild) {
          current = current.lastChild;
        }
      } else {
        current = current.parentNode;
        continue;
      }
      if (!current) {
        return null;
      }
      if (!root.contains(current)) {
        return null;
      }
      if (current.nodeType === Node.TEXT_NODE) {
        if (current.textContent.length === 0) {
          continue;
        }
        return current;
      }
    }
    return null;
  }

  function getNextTextNode(node, root) {
    let current = node;
    while (current && current !== root) {
      if (current.nextSibling) {
        current = current.nextSibling;
        while (current.firstChild) {
          current = current.firstChild;
        }
      } else {
        current = current.parentNode;
        continue;
      }
      if (!current) {
        return null;
      }
      if (!root.contains(current)) {
        return null;
      }
      if (current.nodeType === Node.TEXT_NODE) {
        if (current.textContent.length === 0) {
          continue;
        }
        return current;
      }
    }
    return null;
  }

  function needsSpaceAfterRange(range, root) {
    const probe = range.cloneRange();
    probe.collapse(false);
    if (!expandRangeForward(probe, 1, root)) {
      return false;
    }
    const char = probe.toString().slice(-1);
    return Boolean(char) && !/\s/.test(char);
  }

  function getAnchorRect(target) {
    if (!target) return null;
    if (state.activeType === 'contenteditable') {
      const caretRect = getCaretRect(target);
      if (caretRect) {
        return caretRect;
      }
    }
    return target.getBoundingClientRect();
  }

  function getCaretRect(target) {
    const selection = window.getSelection();
    if (!selection || !selection.rangeCount) {
      return null;
    }
    const range = selection.getRangeAt(0);
    if (!range.collapsed) {
      return range.getBoundingClientRect();
    }
    if (!target.contains(range.startContainer)) {
      return null;
    }
    let rect = range.getBoundingClientRect();
    if (rect && rect.width > 0 && rect.height > 0) {
      return rect;
    }
    const fallback = range.cloneRange();
    if (expandRangeBackward(fallback, 1, target)) {
      rect = fallback.getBoundingClientRect();
      if (rect && rect.width > 0 && rect.height > 0) {
        return rect;
      }
    }
    return target.getBoundingClientRect();
  }

  function repositionOverlay() {
    const target = state.activeField;
    if (!target || state.overlay.root.classList.contains('transtype-hidden')) {
      return;
    }
    const rect = getAnchorRect(target);
    if (!rect) {
      return;
    }
    const minWidth = Math.max(220, rect.width);
    state.overlay.root.style.top = `${rect.bottom + window.scrollY + 8}px`;
    state.overlay.root.style.left = `${rect.left + window.scrollX}px`;
    state.overlay.root.style.minWidth = `${minWidth}px`;
  }

  function hideOverlay() {
    state.overlay.root.classList.add('transtype-hidden');
  }

  function showOverlay() {
    state.overlay.root.classList.remove('transtype-hidden');
    repositionOverlay();
  }

  function createOverlay() {
    const root = document.createElement('div');
    root.className = 'transtype-overlay transtype-hidden';
    root.innerHTML = `
      <div class="transtype-header">XLING</div>
      <div class="transtype-body">
        <div class="transtype-translation" data-role="translation">Start typing to get AI help</div>
        <div class="transtype-hint" data-role="hint"></div>
        <button type="button" class="transtype-cta hidden">Insert suggestion</button>
      </div>
    `;
    document.documentElement.appendChild(root);
    const translation = root.querySelector('[data-role="translation"]');
    const hint = root.querySelector('[data-role="hint"]');
    const cta = root.querySelector('.transtype-cta');
    cta.addEventListener('click', insertTranslation);
    root.addEventListener('mousedown', (event) => {
      // Keep focus on the active input so clicking the HUD won't hide it.
      event.preventDefault();
    });
    return { root, translation, hint, cta };
  }

  attachListeners();
})();
