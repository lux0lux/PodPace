import React from 'react';

interface ErrorMessageProps {
  message: string | null; // Allow null to easily conditionally render
}

const ErrorMessage: React.FC<ErrorMessageProps> = ({ message }) => {
  if (!message) {
    return null; // Don't render anything if there's no message
  }

  const errorStyle: React.CSSProperties = {
    backgroundColor: '#f8d7da', // Light red background
    color: '#721c24', // Dark red text
    border: '1px solid #f5c6cb', // Reddish border
    padding: '1rem',
    borderRadius: '4px',
    marginTop: '1rem',
    marginBottom: '1rem',
  };

  return (
    <div style={errorStyle}>
      <strong>Error:</strong> {message}
    </div>
  );
};

export default ErrorMessage;