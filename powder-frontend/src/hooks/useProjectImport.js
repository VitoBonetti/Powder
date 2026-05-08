import { useRef } from 'react';
import toast from 'react-hot-toast';
import { getApiUrl } from '../config';

export function useProjectImport(onSuccess) {
  const importFileRef = useRef(null);

  const handleImportZip = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('file', file);
    const toastId = toast.loading('Extracting and importing project...');

    try {
      const response = await fetch(getApiUrl('/flow/import/'), {
        method: 'POST',
        credentials: 'include',
        body: formData
      });

      if (!response.ok) throw new Error("Import failed");

      toast.success('Import successful!', { id: toastId });

      // Trigger the success callback (which will refresh the graph)
      if (onSuccess) onSuccess();

    } catch (error) {
      toast.error('Failed to import project', { id: toastId });
    } finally {
      event.target.value = null;
    }
  };

  return { importFileRef, handleImportZip };
}