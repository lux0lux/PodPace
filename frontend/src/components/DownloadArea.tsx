import React from 'react';

interface DownloadAreaProps {
  jobId: string;
  outputFilename: string;
}

const DownloadArea: React.FC<DownloadAreaProps> = ({ jobId, outputFilename }) => {

  // Construct the download URL using the relative path (Vite proxy handles it)
  const downloadUrl = `/api/download/${jobId}`;

  return (
    <div style={{ marginTop: '1.5rem', padding: '1rem', border: '1px solid #ccc', borderRadius: '4px' }}>
      <h3>Processing Complete!</h3>
      <p>Your adjusted audio file is ready for download.</p>
      <a
        href={downloadUrl}
        download={outputFilename} // Suggest filename to the browser
        style={{
            display: 'inline-block',
            padding: '0.6rem 1.2rem',
            backgroundColor: '#28a745',
            color: 'white',
            textDecoration: 'none',
            borderRadius: '4px',
            marginRight: '1rem',
            marginBottom: '1rem'
        }}
      >
        Download Processed File
      </a>
      <p style={{ fontSize: '0.8em', color: '#555' }}>Filename: {outputFilename}</p>

      {/* Reset button is now handled in App.tsx based on status */}
      {/* <button onClick={onReset} style={{ marginLeft: '1rem' }}>Start New Job</button> */}
    </div>
  );
};

export default DownloadArea;