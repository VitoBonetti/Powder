import React from 'react';
import { BACKEND_URL } from './config';

export default function Login() {
  const handleLogin = () => {
    // Redirect the browser straight to our FastAPI GitHub bouncer
    window.location.href = `${BACKEND_URL}/api/auth/login`;
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-[#0d1117] text-[#c9d1d9] font-sans">
      <div className="bg-[#161b22] border border-[#30363d] p-10 rounded-xl shadow-2xl max-w-sm w-full text-center">
        <h1 className="text-2xl font-bold text-white mb-2">Powder Vault</h1>
        <p className="text-sm text-[#8b949e] mb-8">Zero-Trust Local Second Brain</p>

        <button
          onClick={handleLogin}
          className="w-full bg-[#238636] hover:bg-[#2ea043] text-white font-bold py-3 px-4 rounded transition-colors flex items-center justify-center gap-2"
        >
          <svg height="20" aria-hidden="true" viewBox="0 0 16 16" version="1.1" width="20" fill="currentColor">
            <path d="M8 0c4.42 0 8 3.58 8 8a8.013 8.013 0 0 1-5.45 7.59c-.4.08-.55-.17-.55-.38 0-.27.01-1.13.01-2.2 0-.75-.25-1.23-.54-1.48 1.78-.2 3.65-.88 3.65-3.95 0-.88-.31-1.59-.82-2.15.08-.2.36-1.02-.08-2.12 0 0-.67-.22-2.2.82-.64-.18-1.32-.27-2-.27-.68 0-1.36.09-2 .27-1.53-1.03-2.2-.82-2.2-.82-.44 1.1-.16 1.92-.08 2.12-.51.56-.82 1.28-.82 2.15 0 3.06 1.86 3.75 3.64 3.95-.23.2-.44.55-.51 1.07-.46.21-1.61.55-2.33-.66-.15-.24-.6-.83-1.23-.82-.67.01-.27.38.01.53.34.19.73.9.82 1.13.16.45.68 1.31 2.69.94 0 .67.01 1.3.01 1.49 0 .21-.15.45-.55.38A7.995 7.995 0 0 1 0 8c0-4.42 3.58-8 8-8Z"></path>
          </svg>
          Authenticate via GitHub
        </button>
      </div>
    </div>
  );
}