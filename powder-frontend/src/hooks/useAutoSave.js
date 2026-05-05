import { useState, useEffect } from 'react';

export function useAutoSave(content, activeFile, isImageFile) {
  const [saveStatus, setSaveStatus] = useState("idle");
  const [lastSaved, setLastSaved] = useState(0);

  useEffect(() => {
    if (!activeFile || isImageFile || saveStatus === "idle") return;

    setSaveStatus("saving");

    const delayDebounceFn = setTimeout(() => {
      fetch(`http://localhost:8000/api/notes/${activeFile}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ content: content || "" })
      })
      .then(res => {
        if (!res.ok) throw new Error("Backend rejected save");
        setSaveStatus("saved");
        setLastSaved(Date.now());
      })
      .catch(err => {
        console.error("Error saving note:", err);
        setSaveStatus("saved"); // Reset to prevent infinite loops, handle better in prod
      });
    }, 1000);

    return () => clearTimeout(delayDebounceFn);
  }, [content, activeFile, isImageFile]);

  return { saveStatus, setSaveStatus, lastSaved };
}