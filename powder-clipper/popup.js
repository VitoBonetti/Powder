// --- NATIVE WEB CRYPTO ENGINE ---
const CryptoManager = {
  generateBuffer: (length) => crypto.getRandomValues(new Uint8Array(length)),

  deriveKey: async (pin, salt) => {
    const enc = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey(
      "raw", enc.encode(pin), { name: "PBKDF2" }, false, ["deriveKey"]
    );
    return crypto.subtle.deriveKey(
      { name: "PBKDF2", salt: salt, iterations: 100000, hash: "SHA-256" },
      keyMaterial, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]
    );
  },

  encrypt: async (text, pin) => {
    const salt = CryptoManager.generateBuffer(16);
    const iv = CryptoManager.generateBuffer(12);
    const key = await CryptoManager.deriveKey(pin, salt);
    const enc = new TextEncoder();

    const cipherBuffer = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: iv }, key, enc.encode(text)
    );

    return {
      ciphertext: btoa(String.fromCharCode(...new Uint8Array(cipherBuffer))),
      salt: btoa(String.fromCharCode(...salt)),
      iv: btoa(String.fromCharCode(...iv))
    };
  },

  decrypt: async (cipherObj, pin) => {
    try {
      const salt = new Uint8Array(atob(cipherObj.salt).split('').map(c => c.charCodeAt(0)));
      const iv = new Uint8Array(atob(cipherObj.iv).split('').map(c => c.charCodeAt(0)));
      const ciphertext = new Uint8Array(atob(cipherObj.ciphertext).split('').map(c => c.charCodeAt(0)));

      const key = await CryptoManager.deriveKey(pin, salt);
      const decryptedBuffer = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: iv }, key, ciphertext
      );

      const dec = new TextDecoder();
      return dec.decode(decryptedBuffer);
    } catch (e) {
      throw new Error("Invalid PIN or corrupted data");
    }
  }
};

// --- EXTENSION LOGIC ---
document.addEventListener('DOMContentLoaded', async () => {
  const unlockScreen = document.getElementById('unlock-screen');
  const clipperScreen = document.getElementById('clipper-screen');
  const statusDiv = document.getElementById('status');

  // --- SETTINGS TOGGLE LOGIC ---
  document.getElementById('settings-toggle').addEventListener('click', () => {
    const configPanel = document.getElementById('config-panel');
    if (configPanel.classList.contains('hidden')) {
      configPanel.classList.remove('hidden');
    } else {
      configPanel.classList.add('hidden');
    }
  });

  // 1. FAIL-SAFE INITIALIZATION
  try {
    if (!chrome.storage) {
      throw new Error("Storage permission denied! Please reload extension in chrome://extensions.");
    }

    const storageEngine = chrome.storage.session || chrome.storage.local;
    const session = await storageEngine.get(['activeApiKey', 'serverUrl']);

    if (session.activeApiKey) {
      document.getElementById('server-url').value = session.serverUrl || 'http://localhost:8000';
      document.getElementById('api-key').placeholder = "•••••••••••• (Encrypted)";
      showClipper();
    } else {
      const local = await chrome.storage.local.get(['encryptedApiData']);
      if (local.encryptedApiData) {
        unlockScreen.classList.remove('hidden');
      } else {
        showClipper();
      }
    }
  } catch (err) {
    statusDiv.textContent = `Startup Error: ${err.message}`;
    statusDiv.style.color = '#f85149';
    return;
  }

  function showClipper() {
    unlockScreen.classList.add('hidden');
    clipperScreen.classList.remove('hidden');
    populateClipperData();
  }

  // --- UNLOCK LOGIC ---
  document.getElementById('unlock-btn').addEventListener('click', async () => {
    const pin = document.getElementById('unlock-pin').value;
    const local = await chrome.storage.local.get(['encryptedApiData', 'serverUrl']);

    try {
      const decryptedKey = await CryptoManager.decrypt(local.encryptedApiData, pin);
      const storageEngine = chrome.storage.session || chrome.storage.local;
      await storageEngine.set({ activeApiKey: decryptedKey, serverUrl: local.serverUrl });

      document.getElementById('server-url').value = local.serverUrl || 'http://localhost:8000';
      document.getElementById('api-key').placeholder = "•••••••••••• (Encrypted)";
      statusDiv.textContent = '';
      showClipper();
    } catch (err) {
      statusDiv.textContent = 'Incorrect PIN.';
      statusDiv.style.color = '#f85149';
    }
  });

  // --- SAVE SETTINGS LOGIC (ENCRYPTION) ---
  document.getElementById('save-settings-btn').addEventListener('click', async () => {
    const serverUrl = document.getElementById('server-url').value.replace(/\/$/, '');
    const apiKey = document.getElementById('api-key').value.trim();
    const pin = document.getElementById('setup-pin').value;

    if (!apiKey || !pin) {
      statusDiv.textContent = 'Provide both an API Key and a PIN to encrypt it.';
      statusDiv.style.color = '#f85149';
      return;
    }

    try {
      const encryptedData = await CryptoManager.encrypt(apiKey, pin);
      await chrome.storage.local.set({ encryptedApiData: encryptedData, serverUrl: serverUrl });

      const storageEngine = chrome.storage.session || chrome.storage.local;
      await storageEngine.set({ activeApiKey: apiKey, serverUrl: serverUrl });

      document.getElementById('api-key').value = '';
      document.getElementById('setup-pin').value = '';
      document.getElementById('api-key').placeholder = "•••••••••••• (Encrypted)";
      statusDiv.textContent = '';

      const btn = document.getElementById('save-settings-btn');
      btn.textContent = "Encrypted & Saved!";
      setTimeout(() => btn.textContent = "Encrypt & Save Settings", 2000);
    } catch (err) {
      statusDiv.textContent = 'Encryption failed.';
      statusDiv.style.color = '#f85149';
    }
  });

  // --- NEW ROBUST CLIPPING LOGIC ---
  async function populateClipperData() {
    try {
      let [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab) return;

      document.getElementById('clip-title').value = tab.title || "New Clip";
      document.getElementById('clip-source').value = tab.url || "";

      chrome.scripting.executeScript({
        target: { tabId: tab.id },
        function: () => {
          const sel = window.getSelection();
          if (!sel.rangeCount || sel.toString().trim() === "") return "";

          // Clone the highlighted DOM
          const container = document.createElement("div");
          container.appendChild(sel.getRangeAt(0).cloneContents());

          // 1. Process Inline Elements (Inner-most first)
          container.querySelectorAll('b, strong').forEach(el => {
            el.replaceWith(document.createTextNode(`**${el.textContent}**`));
          });
          container.querySelectorAll('i, em').forEach(el => {
            el.replaceWith(document.createTextNode(`*${el.textContent}*`));
          });

          // 2. Process Smart Links
          container.querySelectorAll('a').forEach(a => {
            const href = a.getAttribute('href');
            if (href && (href.startsWith('/') || href.startsWith('#'))) {
              // Strip internal relative links but keep the formatted text
              a.replaceWith(document.createTextNode(a.textContent));
            } else if (href) {
              // Keep external valid links
              a.replaceWith(document.createTextNode(`[${a.textContent}](${a.href})`));
            }
          });

          // 3. Process Images
          container.querySelectorAll('img').forEach(img => {
            let realSrc = img.currentSrc || img.src || img.getAttribute('data-src');
            const a = document.createElement('a'); a.href = realSrc; // Force absolute URL
            const alt = img.alt || '';
            img.replaceWith(document.createTextNode(`\n![${alt}](${a.href})\n`));
          });

          // 4. Process Blocks (Headings, Paragraphs, Linebreaks)
          ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'].forEach((tag, index) => {
            container.querySelectorAll(tag).forEach(el => {
              el.replaceWith(document.createTextNode(`\n\n${'#'.repeat(index + 1)} ${el.textContent}\n\n`));
            });
          });

          container.querySelectorAll('p').forEach(el => {
            el.replaceWith(document.createTextNode(`\n\n${el.textContent}\n\n`));
          });

          container.querySelectorAll('br').forEach(el => {
            el.replaceWith(document.createTextNode(`\n`));
          });

          // 5. Extract Text (Browser natively strips any remaining unhandled HTML)
          let md = container.textContent;
          return md.trim().replace(/\n{3,}/g, '\n\n');
        }
      }, async (results) => {
        let capturedText = results && results[0] ? results[0].result : "";
        if (!capturedText) {
          try {
            const clipboardText = await navigator.clipboard.readText();
            if (clipboardText) capturedText = "> *Pasted from Clipboard*\n\n" + clipboardText;
          } catch (err) {}
        }
        document.getElementById('clip-content').value = capturedText;
      });
    } catch (err) {
      console.warn("Could not query tab data", err);
    }
  }

  // --- SAVE TO VAULT ---
  document.getElementById('save-btn').addEventListener('click', async () => {
    const storageEngine = chrome.storage.session || chrome.storage.local;
    const session = await storageEngine.get(['activeApiKey', 'serverUrl']);

    if (!session.activeApiKey) {
      statusDiv.textContent = 'Error: Vault is locked or Key is missing.';
      statusDiv.style.color = '#f85149';
      return;
    }

    const btn = document.getElementById('save-btn');
    btn.disabled = true;
    btn.textContent = 'Saving to Powder...';

    try {
      const response = await fetch(`${session.serverUrl}/api/inbox`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': session.activeApiKey
        },
        body: JSON.stringify({
          title: document.getElementById('clip-title').value,
          content: document.getElementById('clip-content').value,
          source: document.getElementById('clip-source').value
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
      statusDiv.textContent = 'Error: Check URL or Server Status.';
      statusDiv.style.color = '#f85149';
      btn.disabled = false;
      btn.textContent = 'Retry Save';
    }
  });
});