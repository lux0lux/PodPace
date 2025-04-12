Okay, here is a detailed plan for building the speech normalization web application, designed to be followable by another AI or a developer.

**Project Goal:** Create a web application where users can upload a podcast audio file, view the average Words Per Minute (WPM) for each detected speaker, specify a target WPM for individual speakers they wish to adjust, and download the audio file processed to meet those targets while preserving pitch and leaving unselected speakers unchanged.

**I. Architecture Choice: Client-Server with Background Task Queue**

*   **Frontend (Client-Side):** Single Page Application (SPA) running in the user's browser. Responsible for UI interactions (file upload, displaying speaker info, collecting user input for target WPMs, showing progress, providing download link).
*   **Backend (Server-Side):** API server responsible for receiving uploads, managing processing jobs, performing all audio analysis (VAD, Diarization, ASR) and manipulation (Time-Stretching, Reconstruction), and serving the final file.
*   **Task Queue:** Essential because audio processing is computationally intensive and time-consuming. The backend API will offload the actual processing work to background workers via a task queue system. This prevents HTTP request timeouts and allows the frontend to poll for status updates.
*   **Temporary Storage:** Needed for uploaded files, intermediate processing artifacts (like segment files if needed), and final output files before download.

**II. Technology Stack Selection**

*   **Backend Runtime & Framework:**
    *   **Runtime:** **Bun.js**
    *   **Language:** **TypeScript**
    *   **Framework:** **ElysiaJS** (Recommended for structure and performance on Bun) or Bun's native `Bun.serve()`.
*   **Frontend Framework:**
    *   **Framework:** **React**
    *   **Tooling:** **Bun** (Package manager, bundler, development server).
*   **Audio Processing & Analysis (Strategy):**
    *   **ASR (Transcription & Word Timestamps) + Diarization (Speaker ID):**
        *   **Method:** **Cloud-based Service API**.
        *   **Provider Example:** **AssemblyAI** (Known for accurate ASR potentially based on or exceeding Whisper quality, speaker diarization, and word-level timestamps - all often available through a single API call). Other providers like Google Cloud Speech-to-Text or AWS Transcribe could be alternatives.
        *   *(Rationale: Offloads complex ML processing, avoids local ML environment setup, provides both ASR and Diarization from one source, requires managing API keys and potential costs).*
    *   **Core Audio Manipulation (Bun/TS):** Leverage **`Bun.spawn`** to call external command-line tools locally.
        *   **Basic Audio Handling & Segmentation:** **`ffmpeg`** (via `Bun.spawn`). Requires `ffmpeg` installed on the server/container.
        *   **Time-Stretching (Pitch Preserving):** **`rubberband-cli`** (via `Bun.spawn`). Requires `rubberband-cli` installed.
*   **Task Queue System:**
    *   **Broker:** **Redis** (via `ioredis` or similar Bun-compatible client).
    *   **Queue Library:** **BullMQ**.
*   **Temporary Storage:**
    *   **Mechanism:** Server's local filesystem (`Bun.file`, `Bun.write`) for temporary files needed by `ffmpeg`/`rubberband`. Use UUIDs (`crypto.randomUUID()`).
    *   **State Management:** Redis (Job status, cloud service job IDs, final results, artifact pointers).
*   **Web Server:** **Bun** (for the main TS app).
*   **Reverse Proxy:** **Nginx**.

**III. Backend API Design (Bun/ElysiaJS)**

Define RESTful endpoints:

*   `POST /api/upload`
    *   Accepts multipart/form-data with the audio file.
    *   Saves the file to a unique temporary location.
    *   Creates a unique `job_id` (e.g., UUID).
    *   Initializes job status in Redis (e.g., `job:<job_id>:status = PENDING`).
    *   Queues a background task (e.g., `analyze_audio_task(job_id, file_path)`) using Celery.
    *   Returns `{'job_id': job_id}`.
*   `GET /api/status/<job_id>`
    *   Retrieves the current status from Redis (e.g., `PENDING`, `PROCESSING_DIARIZATION`, `PROCESSING_ASR`, `READY_FOR_INPUT`, `PROCESSING_ADJUSTMENT`, `COMPLETE`, `FAILED`).
    *   If status is `READY_FOR_INPUT`, also retrieve and include the speaker WPM data (e.g., `{'status': 'READY_FOR_INPUT', 'speakers': [{'id': 'Speaker_1', 'avg_wpm': 155}, ...]}`).
    *   If status is `FAILED`, include an error message.
*   `POST /api/adjust/<job_id>`
    *   Accepts JSON body with speaker adjustments: `{'targets': [{'id': 'Speaker_1', 'target_wpm': 170}, ...]}`. Any speaker ID not included is assumed to be left unchanged.
    *   Validates the input.
    *   Stores the targets in Redis (e.g., `job:<job_id>:targets = ...`).
    *   Updates status in Redis (e.g., `job:<job_id>:status = QUEUED_FOR_ADJUSTMENT`).
    *   Queues the adjustment task (e.g., `apply_adjustment_task(job_id)`) using Celery.
    *   Returns `{'status': 'Adjustment queued'}`.
*   `GET /api/download/<job_id>`
    *   Checks if status is `COMPLETE` in Redis.
    *   Retrieves the path to the final processed audio file from Redis or a known location pattern.
    *   Serves the file using Flask's `send_file` (or equivalent) with appropriate headers for download.
*   **(Optional) `GET /api/speakers/<job_id>`**
    *   Alternative to bundling speaker info in `/status`. Explicitly retrieves speaker WPM data once `READY_FOR_INPUT`.

**IV. Frontend Implementation (React)**

*   **Components:**
    *   `App.js`: Main component, routing (if multiple views needed, though likely single-view). Manages overall state (`jobId`, `jobStatus`, `speakerData`, `error`).
    *   `FileUpload.js`: Contains the file input (`<input type="file">`), handles file selection, triggers the `POST /api/upload` request, and updates `jobId` state. Disables upload button while a job is active.
    *   `JobProgress.js`: Takes `jobId` and `jobStatus` as props. Periodically polls `GET /api/status/{jobId}` (e.g., every 3-5 seconds) when a job is active but not yet `READY_FOR_INPUT` or `COMPLETE`/`FAILED`. Displays user-friendly status messages. Updates `jobStatus` and `speakerData` state in `App.js`.
    *   `SpeakerAdjuster.js`: Takes `speakerData` and `jobId` as props. Renders only when `jobStatus` is `READY_FOR_INPUT`. Displays each speaker's ID and average WPM. Provides number input fields for users to enter `target_wpm` for specific speakers. Includes a "Process Adjustments" button that triggers `POST /api/adjust/{jobId}` with the user's targets.
    *   `DownloadArea.js`: Takes `jobId` and `jobStatus` as props. Renders only when `jobStatus` is `COMPLETE`. Displays a download button/link pointing to `GET /api/download/{jobId}`.
    *   `ErrorMessage.js`: Displays error messages if `jobStatus` becomes `FAILED`.
*   **State Management:** Use React's `useState` and `useEffect` hooks for managing component state and side effects (like API calls and polling). For more complex state, consider `useReducer` or a state management library (Context API, Zustand, Redux Toolkit).
*   **API Calls:** Use `fetch` API or libraries like `axios`.

**V. Backend Workflow & Core Logic (BullMQ Workers)**

1.  **`analyzeAudioWorker.ts` (BullMQ Worker - Handles 'analyze' jobs):**
    *   **Update Status:** Set job status in Redis (`PROCESSING_UPLOAD_CLOUD`).
    *   **Upload to Cloud Provider:**
        *   Use the chosen provider's SDK or a direct HTTP request (e.g., using `fetch` in Bun) to upload the `original_file_path` to the cloud service (e.g., AssemblyAI). Get back a cloud job identifier (e.g., transcript ID). Store this ID in Redis.
    *   **Trigger Cloud Processing:**
        *   Make an API call to the cloud provider to start the transcription/diarization job on the uploaded audio. Ensure parameters request **speaker diarization** and **word-level timestamps**.
        *   **Update Status:** `PROCESSING_CLOUD_ANALYSIS`. Store cloud provider's job ID in Redis.
    *   **Poll for Cloud Results:**
        *   Periodically make API calls to the cloud provider's status endpoint using the cloud job ID. Check if the job is complete. (Implement polling with appropriate delays and backoff).
    *   **Retrieve & Parse Results:**
        *   Once complete, fetch the full results JSON from the cloud provider. This should contain the transcript, word timings, and speaker labels associated with segments/words.
        *   **Update Status:** `PROCESSING_WPM_CALCULATION`.
        *   Parse the provider's JSON response to extract speaker segments (start time, end time, speaker label) and word timestamps.
    *   **Calculate Average WPM per Speaker:**
        *   Implement the WPM calculation logic in TypeScript using the diarization segments and word timestamps from the cloud service response.
    *   **Store Results:** Save calculated speaker WPM data, and necessary cloud results (or pointers) for the adjustment phase in Redis.
    *   **Finalize Analysis:** Update Redis: `job:<job_id>:artifacts = { ... }`, `job:<job_id>:status = READY_FOR_INPUT`.
    *   *Error Handling:* Catch errors during API calls (upload, processing request, polling, result fetching), check for error statuses from the cloud provider, update job status to `FAILED` in Redis.

2.  **`adjustAudioWorker.ts` (BullMQ Worker - Handles 'adjust' jobs):**
    *   **Update Status:** `PROCESSING_ADJUSTMENT`.
    *   **Load Data:** Retrieve original path, diarization results (from Redis, originating from the cloud service), user targets, etc.
    *   **Prepare Segments:** Reconstruct timeline (speech segments based on cloud diarization results, silence gaps derived from timestamps).
    *   **Process Each Segment (using `Bun.spawn` for `ffmpeg`/`rubberband`):**
        *   Initialize list for processed segment file paths.
        *   Iterate through timeline:
            *   **If Speech Segment:**
                *   Get `speaker_id`, lookup `target_wpm`, calculate `scalar`.
                *   **Extract Chunk:** `Bun.spawn` -> `ffmpeg` (`ffmpeg -i input.mp3 -ss start -to end -c copy temp_segment.wav`).
                *   **Time-Stretch:** `Bun.spawn` -> `rubberband-cli` (`rubberband --pitch --tempo scalar temp_segment.wav stretched_segment.wav`).
                *   Add path of `stretched_segment.wav` to list. Clean up `temp_segment.wav`.
            *   **If Silence/Other Segment:**
                *   **Extract/Generate:** `Bun.spawn` -> `ffmpeg`.
                *   Add path to list.
    *   **Reconstruct Audio (using `Bun.spawn` for `ffmpeg`):**
        *   **Update Status:** `PROCESSING_RECONSTRUCTION`.
        *   **Create Concat List:** Generate file listing segments.
        *   **Concatenate:** `Bun.spawn` -> `ffmpeg` (`ffmpeg -f concat ...`).
        *   Clean up intermediate files.
    *   **Finalize:**
        *   Store output path in Redis.
        *   **Update Status:** `COMPLETE`.
    *   *Error Handling:* Catch errors during `spawn` calls or processing, update status to `FAILED`, attempt cleanup.

**VI. Deployment Considerations**

*   **Containerization (Docker Compose):**
    *   `bun-api`: Bun API server (ElysiaJS/native). Needs cloud provider API key access.
    *   `bun-worker`: BullMQ worker(s). **Must have `ffmpeg` and `rubberband-cli` installed.** Needs cloud provider API key access.
    *   `redis`: Redis container.
    *   `nginx`: Nginx container.
*   **Cloud Provider Configuration:**
    *   Requires API keys/credentials for the chosen service (e.g., AssemblyAI). Store these securely (e.g., environment variables, secrets management) and make them available to the `bun-api` and `bun-worker` containers.
*   **Nginx Configuration:**
    *   Serve static React files.
    *   Proxy `/api/` to `bun-api`.
*   **Resources:** `bun-worker` needs resources for `ffmpeg`/`rubberband`. Cloud costs depend on provider pricing and usage.
*   **Scalability:** Celery workers can be scaled horizontally (run more worker containers) to handle more concurrent processing jobs.
*   **Cleanup:** Implement a strategy (e.g., a scheduled Celery task or a cron job) to delete old temporary files and Redis job entries after a certain period (e.g., 24 hours) to prevent disk/memory exhaustion.

**VII. Error Handling & UX**

*   **Backend:** Wrap processing steps in try/except blocks. If an error occurs in a Celery task, update the job status to `FAILED` in Redis and log the error details. Include a user-friendly error message if possible.
*   **Frontend:** Check for `FAILED` status during polling. Display the error message from the backend. Provide clear feedback during upload and processing stages. Disable buttons appropriately to prevent conflicting actions. Handle network errors during API calls.
*   **Include specific handling for cloud API rate limits, errors, and job failures.**

**VIII. Security**

*   **Input Validation:** Sanitize file uploads (check types, potentially size limits). Validate data received in API requests (e.g., target WPMs are numbers within a reasonable range).
*   **File Storage:** Use UUIDs for file/directory names to prevent clashes or guessing. Store temporary files outside the web root. Ensure appropriate file permissions.
*   **Dependencies:** Keep all libraries updated to patch security vulnerabilities.
*   **Protect cloud API keys diligently.**

This version focuses the backend work on interacting with the cloud API for the heavy ML lifting and using local, efficient tools (`ffmpeg`, `rubberband`) via `Bun.spawn` for the audio manipulation tasks.