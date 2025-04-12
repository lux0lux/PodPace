# PodPace - Podcast Speech Normalization

This application allows users to upload podcast audio files, analyze speaker WPM, and adjust speech speed per speaker.

## Prerequisites

Before running the application, ensure you have the following installed on your system:

*   **Bun:** Follow the installation instructions at [https://bun.sh/docs/installation](https://bun.sh/docs/installation)
*   **ffmpeg:** Required for audio file manipulation.
    *   Debian/Ubuntu: `sudo apt update && sudo apt install ffmpeg`
    *   macOS (Homebrew): `brew install ffmpeg`
    *   Other: Use your system's package manager or download from [https://ffmpeg.org/](https://ffmpeg.org/)
*   **rubberband-cli:** Required for high-quality time-stretching.
    *   Debian/Ubuntu: `sudo apt update && sudo apt install rubberband-cli`
    *   macOS (Homebrew): `brew install rubberband`
    *   Other: Use your system's package manager or find instructions at [https://breakfastquay.com/rubberband/](https://breakfastquay.com/rubberband/)
*   **Redis:** Required for the task queue message broker and job state management. Ensure a Redis server is running and accessible.
    *   Docker (recommended): `docker run -d -p 6379:6379 redis:latest`
    *   Or install via package manager (e.g., `sudo apt install redis-server`).

## Setup

1.  **Navigate to Project Directory:**
    Ensure you are in the `PodPace` directory.
    ```bash
    cd /path/to/your/dev/PodPace
    ```
2.  **Install Backend Dependencies:**
    ```bash
    cd backend
    bun install
    cd ..
    ```
3.  **Install Frontend Dependencies:**
    ```bash
    cd PodPace/frontend
    bun install
    cd ..
    ```
4.  **Configure Environment Variables:**
    Create a `.env` file in the `backend` directory (`PodPace/backend/.env`) and add the following variables:

    ```dotenv
    # Redis Connection
    REDIS_HOST=127.0.0.1
    REDIS_PORT=6379
    # REDIS_PASSWORD= (optional)

    # Cloud ASR/Diarization Provider (e.g., AssemblyAI)
    ASSEMBLYAI_API_KEY=YOUR_ASSEMBLYAI_API_KEY

    # Define upload/output directories (optional, defaults are within backend/)
    # UPLOAD_DIR=./uploads
    # OUTPUT_DIR=./output

    # API Port (Optional, defaults to 3000)
    # API_PORT=3000
    ```

    *Note: The frontend uses Vite's proxy. No frontend-specific environment variables are needed for the API connection by default.*

## Running the Application

The application consists of a backend (API server + 2 workers) and a frontend.

1.  **Start Redis:** Ensure your Redis server is running.

2.  **Start Backend Components (in separate terminals):**
    *   API Server:
        ```bash
        cd PodPace/backend
        bun run index.ts
        ```
    *   Analyze Worker:
        ```bash
        cd PodPace/backend
        bun run worker-analyze.ts
        ```
    *   Adjust Worker:
        ```bash
        cd PodPace/backend
        bun run worker-adjust.ts
        ```

3.  **Start Frontend Dev Server (in a separate terminal):**
    ```bash
    cd PodPace/frontend
    bun run dev
    ```
    *   This will start the Vite development server, typically on `http://localhost:5173`.
    *   Open the URL provided in the terminal output in your web browser.

## Development

(Details to be added later)
