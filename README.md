# Nolla - Medical Transcription Dashboard

A modern web application for medical professionals to transcribe and manage clinical notes with features like speaker diarization and multiple note templates.

## Features

- Real-time audio transcription using OpenAI's Whisper model
- Speaker diarization to differentiate between clinician and patient
- Multiple note templates (SOAP, BIRP, DAP, Basic)
- PDF export functionality
- Modern, responsive user interface

## Prerequisites

- Docker
- OpenAI API key

## Deployment Instructions

1. Clone the repository:
   ```bash
   git clone <your-repository-url>
   cd nolla-medical-transcription
   ```

2. Create a `.env` file with your OpenAI API key:
   ```
   OPENAI_API_KEY=your_api_key_here
   ```

3. Build and run with Docker:
   ```bash
   docker build -t nolla-medical .
   docker run -p 8080:8080 --env-file .env nolla-medical
   ```

4. Access the application at `http://localhost:8080`

## Cloud Deployment Options

### Deploy to Heroku

1. Install the Heroku CLI and login:
   ```bash
   heroku login
   ```

2. Create a new Heroku app:
   ```bash
   heroku create your-app-name
   ```

3. Set the OpenAI API key:
   ```bash
   heroku config:set OPENAI_API_KEY=your_api_key_here
   ```

4. Deploy the application:
   ```bash
   git push heroku main
   ```

### Deploy to Google Cloud Run

1. Install and initialize the Google Cloud SDK
2. Enable the Cloud Run API
3. Build and push the container:
   ```bash
   gcloud builds submit --tag gcr.io/YOUR_PROJECT_ID/nolla-medical
   ```

4. Deploy to Cloud Run:
   ```bash
   gcloud run deploy --image gcr.io/YOUR_PROJECT_ID/nolla-medical --platform managed
   ```

## Security Considerations

- The application requires patient consent before processing audio
- All data is processed securely and not stored permanently
- Uses environment variables for sensitive information
- Implements proper error handling and input validation

## License

This project is licensed under the MIT License - see the LICENSE file for details.
