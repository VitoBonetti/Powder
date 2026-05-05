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
      if (!sel.rangeCount || sel.toString().trim() === "") return ""; // Nothing highlighted

      // ... (Keep your existing HTML-to-Markdown Regex logic here) ...
      const container = document.createElement("div");
      container.appendChild(sel.getRangeAt(0).cloneContents());

      let md = container.innerHTML
        .replace(/<img[^>]*src="([^"]+)"[^>]*alt="([^"]*)"[^>]*>/gi, '\n![$2]($1)\n')
        .replace(/<img[^>]*src="([^"]+)"[^>]*>/gi, '\n![]($1)\n')
        .replace(/<a[^>]*href="([^"]+)"[^>]*>(.*?)<\/a>/gi, '[$2]($1)')
        .replace(/<(b|strong)[^>]*>(.*?)<\/\1>/gi, '**$2**')
        .replace(/<(i|em)[^>]*>(.*?)<\/\1>/gi, '*$2*')
        .replace(/<h([1-6])[^>]*>(.*?)<\/h\1>/gi, (m, lvl, txt) => '\n\n' + '#'.repeat(lvl) + ' ' + txt + '\n\n')
        .replace(/<p[^>]*>(.*?)<\/p>/gi, '\n\n$1\n\n')
        .replace(/<br[^>]*>/gi, '\n')
        .replace(/<[^>]+>/g, '');

      const decoder = document.createElement('textarea');
      decoder.innerHTML = md;
      return decoder.value.trim().replace(/\n{3,}/g, '\n\n');
    }
  }, async (results) => {
    let capturedText = results && results[0] ? results[0].result : "";

    // THE CLIPBOARD FALLBACK
    if (!capturedText) {
      try {
        const clipboardText = await navigator.clipboard.readText();
        if (clipboardText) {
          capturedText = "> *Pasted from Clipboard*\n\n" + clipboardText;
        }
      } catch (err) {
        console.warn("Could not read clipboard", err);
      }
    }

    contentInput.value = capturedText;
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