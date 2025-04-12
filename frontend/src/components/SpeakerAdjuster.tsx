import React, { useState, useEffect } from 'react';

// Import shared interface from the frontend interfaces file
import type { SpeakerWPM, TargetWPM } from '../interfaces';

interface SpeakerAdjusterProps {
  jobId: string;
  speakerData: SpeakerWPM[];
  onSubmit: () => void; // Callback when adjustment is successfully submitted
  onError: (message: string) => void; // Callback for errors
}

const SpeakerAdjuster: React.FC<SpeakerAdjusterProps> = ({
  jobId,
  speakerData,
  onSubmit,
  onError
}) => {
  // State to hold the target WPM for each speaker ID
  const [targets, setTargets] = useState<Record<string, number | ''>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Initialize targets state when speakerData is available
  useEffect(() => {
    const initialTargets: Record<string, number | ''> = {};
    speakerData.forEach(speaker => {
      // Initialize with current avg_wpm, user can then change it
      initialTargets[speaker.id] = speaker.avg_wpm;
    });
    setTargets(initialTargets);
  }, [speakerData]);

  const handleTargetChange = (
    speakerId: string,
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const value = event.target.value;
    setTargets(prevTargets => ({
      ...prevTargets,
      [speakerId]: value === '' ? '' : Number(value) // Store as number or empty string
    }));
  };

  const handleSubmit = async () => {
    setIsSubmitting(true);
    onError(''); // Clear previous errors

    // Format targets for the API
    const apiTargets: TargetWPM[] = Object.entries(targets)
      .filter(([_, wpm]) => wpm !== '' && wpm > 0) // Only include valid numbers
      .map(([id, wpm]) => ({
        id: id,
        target_wpm: wpm as number // We know it's a number due to filter
      }));

    if (apiTargets.length === 0) {
        onError('Please set at least one valid target WPM.');
        setIsSubmitting(false);
        return;
    }

    try {
      const apiUrl = '/api'; // Use relative path for Vite proxy
      console.log(`Submitting adjustments for job ${jobId} to: ${apiUrl}/adjust/${jobId}`);
      console.log('Payload:', { targets: apiTargets });

      const response = await fetch(`${apiUrl}/adjust/${jobId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ targets: apiTargets }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || `Adjustment submission failed (${response.status})`);
      }

      console.log('Adjustment submission successful:', result);
      onSubmit(); // Notify parent component

    } catch (error: any) {
      console.error('Adjustment submission error:', error);
      onError(error.message || 'Failed to submit adjustments.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div>
      <h3>Adjust Speaker Speeds</h3>
      <p>Set a target Words Per Minute (WPM) for speakers you want to adjust. Leave blank or unchanged to keep original speed.</p>
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '1rem' }}>
        <thead>
          <tr>
            <th style={{ textAlign: 'left', borderBottom: '1px solid #ccc', padding: '0.5rem' }}>Speaker ID</th>
            <th style={{ textAlign: 'right', borderBottom: '1px solid #ccc', padding: '0.5rem' }}>Avg. WPM</th>
            <th style={{ textAlign: 'right', borderBottom: '1px solid #ccc', padding: '0.5rem' }}>Target WPM</th>
          </tr>
        </thead>
        <tbody>
          {speakerData.map((speaker) => (
            <tr key={speaker.id}>
              <td style={{ padding: '0.5rem' }}>{speaker.id}</td>
              <td style={{ textAlign: 'right', padding: '0.5rem' }}>{speaker.avg_wpm.toFixed(0)}</td>
              <td style={{ textAlign: 'right', padding: '0.5rem' }}>
                <input
                  type="number"
                  min="50" // Set reasonable min/max if desired
                  max="400"
                  value={targets[speaker.id] ?? ''} // Use ?? to handle potential undefined on initial render
                  onChange={(e) => handleTargetChange(speaker.id, e)}
                  placeholder={speaker.avg_wpm.toFixed(0)} // Show original as placeholder
                  style={{ width: '80px', textAlign: 'right' }}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <button onClick={handleSubmit} disabled={isSubmitting}>
        {isSubmitting ? 'Submitting...' : 'Process Adjustments'}
      </button>
    </div>
  );
};

export default SpeakerAdjuster;