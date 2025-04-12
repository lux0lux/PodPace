import { Worker, Job } from 'bullmq';
import Redis from 'ioredis';
import path from 'node:path';
import fs from 'node:fs/promises';
// Import shared interfaces using `import type`
import type {
    AnalyzeJobData,
    SpeakerWPM,
    Segment,
    Utterance,
    AssemblyAIUploadResponse,
    AssemblyAISubmitResponse,
    AssemblyAITranscriptResponse
} from './interfaces';

// --- Configuration ---
const REDIS_HOST = process.env.REDIS_HOST || '127.0.0.1';
const REDIS_PORT = parseInt(process.env.REDIS_PORT || '6379', 10);
const REDIS_PASSWORD = process.env.REDIS_PASSWORD;
const ASSEMBLYAI_API_KEY = process.env.ASSEMBLYAI_API_KEY;
const ANALYZE_QUEUE_NAME = 'audio-analyze';
const ASSEMBLYAI_API_BASE = 'https://api.assemblyai.com/v2';

// --- Basic Checks ---
if (!ASSEMBLYAI_API_KEY) {
    console.error('FATAL ERROR: ASSEMBLYAI_API_KEY environment variable is not set.');
    process.exit(1);
}

// --- Redis Connection (Separate connection for worker recommended) ---
console.log(`Worker connecting to Redis at ${REDIS_HOST}:${REDIS_PORT}...`);
const redisConnection = new Redis({
    host: REDIS_HOST,
    port: REDIS_PORT,
    password: REDIS_PASSWORD,
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
});

redisConnection.on('connect', () => {
    console.log('Worker successfully connected to Redis.');
});

redisConnection.on('error', (err: Error) => {
    console.error('Worker Redis connection error:', err);
    // Worker might not be able to function without Redis
    process.exit(1);
});

// --- Job Status Tracking Helper (from index.ts - consider sharing via a module) ---
const getJobStatusKey = (jobId: string) => `job:${jobId}:status`;
const getJobDataKey = (jobId: string) => `job:${jobId}:data`;

async function updateJobStatus(jobId: string, status: string, data?: Record<string, any>) {
    console.log(`[Job ${jobId}] Updating status to ${status}`);
    try {
        const multi = redisConnection.multi();
        multi.hset(getJobStatusKey(jobId), 'status', status, 'updatedAt', String(Date.now()));
        if (data) {
            const dataToStore = Object.entries(data).reduce((acc, [key, value]) => {
                acc[key] = typeof value === 'string' ? value : JSON.stringify(value);
                return acc;
            }, {} as Record<string, string>);
            multi.hset(getJobDataKey(jobId), dataToStore);
        }
        await multi.exec();
    } catch (error) {
        console.error(`[Job ${jobId}] Failed to update status to ${status}:`, error);
        // Don't throw here, as the main job might still proceed or fail later
    }
}

// --- AssemblyAI API Helpers ---

// Remove local AssemblyAI response interfaces if they exist (they were added in a previous step)
// interface AssemblyAIUploadResponse { ... }
// interface AssemblyAISubmitResponse { ... }
// interface AssemblyAITranscriptResponse { ... }

async function uploadFileToAssemblyAI(filePath: string, jobId: string): Promise<string> {
    console.log(`[Job ${jobId}] Uploading file to AssemblyAI: ${filePath}`);
    try {
        const fileData = await fs.readFile(filePath);
        const response = await fetch(`${ASSEMBLYAI_API_BASE}/upload`, {
            method: 'POST',
            headers: {
                authorization: ASSEMBLYAI_API_KEY as string,
                // Content-Type is not needed; AssemblyAI detects it
            },
            body: fileData,
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`AssemblyAI upload failed: ${response.status} ${response.statusText} - ${errorText}`);
        }

        // Assert the type of the JSON response
        const result = await response.json() as AssemblyAIUploadResponse;
        if (!result.upload_url) {
            throw new Error('AssemblyAI upload response missing upload_url');
        }
        console.log(`[Job ${jobId}] File uploaded. AssemblyAI URL: ${result.upload_url}`);
        return result.upload_url;
    } catch (error: any) {
        console.error(`[Job ${jobId}] Error during AssemblyAI upload:`, error);
        throw error; // Re-throw to be caught by the main processor
    }
}

async function submitTranscriptionJob(audioUrl: string, jobId: string): Promise<string> {
    console.log(`[Job ${jobId}] Submitting transcription job to AssemblyAI for URL: ${audioUrl}`);
    try {
        const response = await fetch(`${ASSEMBLYAI_API_BASE}/transcript`, {
            method: 'POST',
            headers: {
                authorization: ASSEMBLYAI_API_KEY as string,
                'content-type': 'application/json',
            },
            body: JSON.stringify({
                audio_url: audioUrl,
                speaker_labels: true, // Request diarization
                // language_code: 'en_us', // Optional: specify language
            }),
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`AssemblyAI job submission failed: ${response.status} ${response.statusText} - ${errorText}`);
        }

        // Assert the type of the JSON response
        const result = await response.json() as AssemblyAISubmitResponse;
        if (!result.id) {
            throw new Error('AssemblyAI submission response missing transcript ID');
        }
        console.log(`[Job ${jobId}] Transcription job submitted. AssemblyAI Transcript ID: ${result.id}`);
        return result.id;
    } catch (error: any) {
        console.error(`[Job ${jobId}] Error submitting AssemblyAI job:`, error);
        throw error;
    }
}

async function pollTranscriptionStatus(transcriptId: string, jobId: string): Promise<AssemblyAITranscriptResponse> {
    const pollInterval = 5000; // Poll every 5 seconds
    const maxAttempts = 720; // Max attempts (e.g., 720 * 5s = 1 hour)
    let attempts = 0;

    console.log(`[Job ${jobId}] Polling AssemblyAI status for Transcript ID: ${transcriptId}`);

    while (attempts < maxAttempts) {
        attempts++;
        try {
            const response = await fetch(`${ASSEMBLYAI_API_BASE}/transcript/${transcriptId}`, {
                headers: { authorization: ASSEMBLYAI_API_KEY as string },
            });

            if (!response.ok) {
                // Handle 404 potentially meaning job expired or ID wrong after many attempts?
                console.warn(`[Job ${jobId}] AssemblyAI polling failed: ${response.status} ${response.statusText}`);
                // Continue polling for a while, maybe it's transient
                await Bun.sleep(pollInterval);
                continue;
            }

            // Assert the type of the JSON response
            const result = await response.json() as AssemblyAITranscriptResponse;

            if (result.status === 'completed') {
                console.log(`[Job ${jobId}] AssemblyAI transcription completed.`);
                return result; // Return the full transcript data
            } else if (result.status === 'error') {
                console.error(`[Job ${jobId}] AssemblyAI transcription failed: ${result.error}`);
                throw new Error(`AssemblyAI transcription failed: ${result.error}`);
            } else if (result.status === 'queued' || result.status === 'processing') {
                console.log(`[Job ${jobId}] AssemblyAI status: ${result.status} (Attempt ${attempts})`);
                await Bun.sleep(pollInterval);
            } else {
                console.warn(`[Job ${jobId}] AssemblyAI unknown status: ${result.status}`);
                await Bun.sleep(pollInterval);
            }
        } catch (error: any) {
            console.error(`[Job ${jobId}] Error during AssemblyAI polling:`, error);
            // Decide whether to retry or fail immediately
            await Bun.sleep(pollInterval); // Wait before potentially retrying
            // Consider adding logic to break loop after several consecutive network errors
        }
    }

    throw new Error(`[Job ${jobId}] AssemblyAI transcription timed out after ${attempts} attempts.`);
}

// --- WPM Calculation --- //

// Remove local Utterance and SpeakerWPM interfaces
// interface Utterance { ... }
// interface SpeakerWPM { ... }

function calculateWPM(transcriptData: AssemblyAITranscriptResponse): SpeakerWPM[] {
    if (!transcriptData?.utterances || !Array.isArray(transcriptData.utterances)) {
        console.warn('WPM Calculation: No utterances found in transcript data.');
        return [];
    }

    const speakerStats: Record<string, { wordCount: number; durationMs: number }> = {};

    for (const utterance of transcriptData.utterances as Utterance[]) {
        const speakerLabel = utterance.speaker;
        if (speakerLabel === null || speakerLabel === undefined) {
            // Skip utterances with no identified speaker for WPM calculation
            continue;
        }

        if (!speakerStats[speakerLabel]) {
            speakerStats[speakerLabel] = { wordCount: 0, durationMs: 0 };
        }

        // Count words by splitting the text - simplistic, doesn't handle punctuation perfectly
        const words = utterance.text.trim().split(/\s+/).filter(Boolean);
        speakerStats[speakerLabel].wordCount += words.length;

        // Duration of this specific utterance
        const duration = utterance.end - utterance.start;
        speakerStats[speakerLabel].durationMs += duration;
    }

    const results: SpeakerWPM[] = [];
    for (const [speakerId, stats] of Object.entries(speakerStats)) {
        if (stats.durationMs > 0 && stats.wordCount > 0) {
            const durationSeconds = stats.durationMs / 1000;
            const wpm = Math.round((stats.wordCount / durationSeconds) * 60);
            results.push({
                id: `Speaker_${speakerId}`, // Add prefix for clarity
                avg_wpm: wpm,
                total_words: stats.wordCount,
                total_duration_s: parseFloat(durationSeconds.toFixed(2)),
            });
        } else {
             results.push({
                id: `Speaker_${speakerId}`,
                avg_wpm: 0,
                total_words: 0,
                total_duration_s: 0,
            });
        }
    }

    console.log('Calculated Speaker WPMs:', results);
    return results;
}

// --- Worker Implementation --- //

// Remove local AnalyzeJobData interface
// interface AnalyzeJobData { ... }

const processAnalyzeJob = async (job: Job<AnalyzeJobData>) => {
    const { jobId, filePath, originalFilename } = job.data;
    console.log(`[Job ${jobId}] Starting processing for ${originalFilename}`);

    let assemblyAiUploadUrl: string | null = null;
    let assemblyAiTranscriptId: string | null = null;

    try {
        // 1. Update status and upload to AssemblyAI
        await updateJobStatus(jobId, 'PROCESSING_UPLOAD_CLOUD');
        assemblyAiUploadUrl = await uploadFileToAssemblyAI(filePath, jobId);

        // 2. Update status and submit transcription job
        await updateJobStatus(jobId, 'PROCESSING_CLOUD_ANALYSIS');
        assemblyAiTranscriptId = await submitTranscriptionJob(assemblyAiUploadUrl, jobId);

        // 3. Poll for results
        const transcriptData = await pollTranscriptionStatus(assemblyAiTranscriptId, jobId);

        // 4. Update status and calculate WPM
        await updateJobStatus(jobId, 'PROCESSING_WPM_CALCULATION');
        const speakerWPMs = calculateWPM(transcriptData);

        // --> ADD THIS: Extract segment data for the adjust worker <--
        let diarizationSegments: Segment[] = [];
        if (transcriptData.utterances && Array.isArray(transcriptData.utterances)) {
            diarizationSegments = transcriptData.utterances.map((utt: Utterance) => ({
                speaker: utt.speaker, // Keep the original label (e.g., A, B)
                start: utt.start,
                end: utt.end,
            }));
        } else {
            console.warn(`[Job ${jobId}] No utterances found in transcript data to extract segments.`);
        }
        // --> END OF ADDED CODE <--

        // 5. Final update: Ready for input
        // Store results (WPM, segments, transcript ID) in Redis
        await updateJobStatus(jobId, 'READY_FOR_INPUT', {
            assemblyAiTranscriptId: assemblyAiTranscriptId,
            speakers: JSON.stringify(speakerWPMs),
            diarizationSegments: JSON.stringify(diarizationSegments),
            // transcriptText: transcriptData.text, // Optionally store full text
        });

        console.log(`[Job ${jobId}] Successfully processed and ready for input.`);

    } catch (error: any) {
        console.error(`[Job ${jobId}] Processing failed:`, error);
        // Update status to FAILED with error message
        await updateJobStatus(jobId, 'FAILED', { error: error.message || 'Unknown processing error' });
        // Optional: Rethrow error if you want BullMQ to potentially retry based on queue settings
        // throw error;
    }
};

// --- Worker Initialization --- //
const worker = new Worker<AnalyzeJobData>(ANALYZE_QUEUE_NAME, processAnalyzeJob, {
    connection: redisConnection,
    concurrency: 5, // Process up to 5 jobs concurrently (adjust as needed)
    removeOnComplete: { count: 1000 }, // Keep logs of last 1000 completed jobs
    removeOnFail: { count: 5000 },    // Keep logs of last 5000 failed jobs
});

worker.on('completed', (job: Job, result: any) => {
    console.log(`[Job ${job.data.jobId}] Completed successfully.`);
});

worker.on('failed', (job: Job | undefined, error: Error) => {
    if (job) {
        console.error(`[Job ${job.data.jobId}] Failed:`, error);
    } else {
        console.error('Worker encountered a failure with an undefined job:', error);
    }
});

worker.on('error', (error: Error) => {
    console.error('Worker encountered an error:', error);
});

console.log(`Worker listening for jobs on queue: ${ANALYZE_QUEUE_NAME}`);

// --- Graceful Shutdown --- //
async function gracefulShutdown(signal: string) {
    console.log(`\nReceived ${signal}, shutting down worker gracefully...`);
    try {
        await worker.close();
        console.log('BullMQ worker closed.');
        redisConnection.disconnect();
        console.log('Redis connection closed.');
        console.log('Worker shutdown complete.');
        process.exit(0);
    } catch (error) {
        console.error('Error during worker graceful shutdown:', error);
        process.exit(1);
    }
}

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));