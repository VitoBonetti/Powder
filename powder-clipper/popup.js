document.addEventListener('DOMContentLoaded', async () => {
  const titleInput = document.getElementById('clip-title');
  const contentInput = document.getElementById('clip-content');
  const sourceInput = document.getElementById('clip-source');
  const saveBtn = document.getElementById('save-btn');
  const statusDiv = document.getElementById('status');

  let [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  titleInput.value = tab.title;
  sourceInput.value = tab.url;

  // --- NEW: THE HTML-TO-MARKDOWN COMPILER ---
  chrome.scripting.executeScript({
    target: { tabId: tab.id },
    function: () => {
      const sel = window.getSelection();
      if (!sel.rangeCount) return ""; // Nothing highlighted

      // 1. Grab the actual HTML elements they highlighted, not just the text
      const container = document.createElement("div");
      container.appendChild(sel.getRangeAt(0).cloneContents());

      // 2. Translate the HTML tags into Markdown syntax
      let md = container.innerHTML
        // Convert Images (with or without alt text)
        .replace(/<img[^>]*src="([^"]+)"[^>]*alt="([^"]*)"[^>]*>/gi, '\n![$2]($1)\n')
        .replace(/<img[^>]*src="([^"]+)"[^>]*>/gi, '\n![]($1)\n')
        // Convert Links
        .replace(/<a[^>]*href="([^"]+)"[^>]*>(.*?)<\/a>/gi, '[$2]($1)')
        // Convert Bold & Italics
        .replace(/<(b|strong)[^>]*>(.*?)<\/\1>/gi, '**$2**')
        .replace(/<(i|em)[^>]*>(.*?)<\/\1>/gi, '*$2*')
        // Convert Headers (h1-h6)
        .replace(/<h([1-6])[^>]*>(.*?)<\/h\1>/gi, (m, lvl, txt) => '\n\n' + '#'.repeat(lvl) + ' ' + txt + '\n\n')
        // Convert Paragraphs & Line Breaks
        .replace(/<p[^>]*>(.*?)<\/p>/gi, '\n\n$1\n\n')
        .replace(/<br[^>]*>/gi, '\n')
        // Strip out any remaining HTML tags (like <div> or <span>) we don't care about
        .replace(/<[^>]+>/g, '');

      // 3. Clean up messy HTML entities (turns &amp; back into &)
      const decoder = document.createElement('textarea');
      decoder.innerHTML = md;

      // Clean up excessive blank lines
      return decoder.value.trim().replace(/\n{3,}/g, '\n\n');
    }
  }, (results) => {
    if (results && results[0] && results[0].result) {
      contentInput.value = results[0].result;
    }
  });

  // Save Button Logic (Unchanged)
  saveBtn.addEventListener('click', async () => {
    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving to Powder...';

    try {
      const response = await fetch('http://127.0.0.1:8000/api/inbox', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: titleInput.value,
          content: contentInput.value,
          source: sourceInput.value
        })
      });

      if (response.ok) {
        statusDiv.textContent = 'Successfully breached the Vault!';
        statusDiv.style.color = '#3fb950';
        setTimeout(() => window.close(), 1500);
      } else {
        throw new Error('Backend rejected the payload.');
      }
    } catch (err) {
      statusDiv.textContent = 'Error: Is your Python server running?';
      statusDiv.style.color = '#f85149';
      saveBtn.disabled = false;
      saveBtn.textContent = 'Retry Save';
    }
  });
});