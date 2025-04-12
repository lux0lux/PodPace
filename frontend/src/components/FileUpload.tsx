import React, { useState, useCallback } from 'react';

interface FileUploadProps {
  onUploadSuccess: (jobId: string) => void;
  onUploadError: (errorMessage: string) => void;
  setIsLoading: (isLoading: boolean) => void;
}

const FileUpload: React.FC<FileUploadProps> = ({
  onUploadSuccess,
  onUploadError,
  setIsLoading
}) => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files[0]) {
      setSelectedFile(event.target.files[0]);
      console.log('File selected:', event.target.files[0].name);
    }
  };

  const handleUpload = async () => {
    if (!selectedFile) {
      onUploadError('Please select a file first.');
      return;
    }

    setIsLoading(true);
    // Clear previous errors by passing an empty string
    onUploadError('');

    const formData = new FormData();
    formData.append('audioFile', selectedFile);

    try {
      // Use relative path, Vite proxy will handle forwarding
      const apiUrl = '/api'; // No need for full URL or env var here anymore
      console.log(`Uploading via Vite proxy to backend path: ${apiUrl}/upload`);

      const response = await fetch(`${apiUrl}/upload`, { // Use relative path
        method: 'POST',
        body: formData,
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || `Upload failed with status ${response.status}`);
      }

      if (!result.job_id) {
         throw new Error('Invalid response from server: missing job_id');
      }

      console.log('Upload successful, Job ID:', result.job_id);
      onUploadSuccess(result.job_id);

    } catch (error: any) {
      console.error('Upload error:', error);
      onUploadError(error.message || 'An unknown error occurred during upload.');
      setIsLoading(false); // Ensure loading is stopped on error
    }
    // Don't set isLoading false on success, as the App component handles the transition
  };

  // --- Drag and Drop Handlers ---
  const handleDragEnter = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDragOver = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    // Indicate this is a valid drop target
    event.dataTransfer.dropEffect = 'copy';
  }, []);

  const handleDrop = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(false);

    if (event.dataTransfer.files && event.dataTransfer.files[0]) {
      // Validate file type if needed before setting
      if (event.dataTransfer.files[0].type.startsWith('audio/')) {
          setSelectedFile(event.dataTransfer.files[0]);
          console.log('File dropped:', event.dataTransfer.files[0].name);
      } else {
          onUploadError('Invalid file type dropped. Please drop an audio file.');
      }
    }
  }, [onUploadError]);

  // Basic styling for the drop zone
  const dropZoneStyle: React.CSSProperties = {
    border: `2px dashed ${isDragging ? '#007bff' : '#ccc'}`,
    padding: '2rem',
    textAlign: 'center',
    marginBottom: '1rem',
    transition: 'border-color 0.3s ease',
  };

  return (
    <div>
      <h3>Upload Podcast Audio</h3>
      <div
        style={dropZoneStyle}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        <input
          type="file"
          accept="audio/*" // Accept any audio format
          onChange={handleFileChange}
          id="audio-upload"
          style={{ display: 'none' }} // Hide default input, use label/dropzone
        />
        <label htmlFor="audio-upload" style={{ cursor: 'pointer' }}>
          {selectedFile
            ? `Selected: ${selectedFile.name}`
            : 'Drag & drop an audio file here, or click to select'}
        </label>
      </div>

      <button
        onClick={handleUpload}
        disabled={!selectedFile}
      >
        Upload and Analyze
      </button>
    </div>
  );
};

export default FileUpload;