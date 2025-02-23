# Next.js Video Editing Application

This is a video editing application built with [Next.js](https://nextjs.org) that allows users to upload videos, edit them, and transcribe audio into text. The application is designed to provide a seamless user experience with real-time processing capabilities.

## Features

- **Video Upload**: Users can upload video files for editing.
- **Video Transcription**: The application transcribes the audio from uploaded videos into text using a backend service.
- **Real-time Processing**: Users can see the results of their edits and transcriptions in real-time.
- **User-Friendly Interface**: Designed with a clean and intuitive interface for easy navigation and usage.

## Getting Started

To get started with the application, follow these steps:

### Prerequisites

Make sure you have the following installed on your machine:

- Node.js (version 12 or later)
- npm (Node package manager)
- A running backend server (see the API Integration section for details)

### Running the Development Server

1. Clone the repository:

   ```bash
   git clone <repository-url>
   cd <repository-directory>
   ```

2. Install the dependencies:

   ```bash
   npm install
   ```

3. Start the development server:

   ```bash
   npm run dev
   ```

### API Integration

This application integrates with a backend API, ensuring that the backend server is running and properly configured to handle CORS requests from the frontend video editing suite. The backend is responsible for processing video uploads and performing audio transcription to allow the agent to gain contextual information about the videos.