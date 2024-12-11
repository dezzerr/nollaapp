# Nolla Transcription Dashboard

A modern web application for medical professionals to record, transcribe, and generate clinical notes and letters from patient sessions. Built with Flask, OpenAI's APIs, and modern web technologies.

## Features

- **Audio Recording**: Real-time audio recording with visual feedback
- **Transcription**: Automatic transcription using OpenAI's Whisper model
- **Speaker Diarization**: Distinguishes between clinician and patient in transcripts
- **Multiple Note Templates**: Support for various clinical note formats:
  - SOAP (Subjective, Objective, Assessment, Plan)
  - BIRP (Behavior, Intervention, Response, Plan)
  - DAP (Data, Assessment, Plan)
  - Basic Template
- **Clinical Letter Generation**: AI-powered generation of professional clinical letters
- **Modern UI**: Clean, responsive interface with real-time updates

## Tech Stack

### Backend
- **Flask**: Web framework
- **Flask-SocketIO**: Real-time communication
- **Flask-SQLAlchemy**: Database ORM
- **Flask-Login**: User authentication
- **OpenAI API**: Whisper (transcription) and GPT-3.5 (note generation)

### Frontend
- **HTML5/CSS3**: Structure and styling
- **JavaScript**: Client-side functionality
- **TailwindCSS**: Utility-first CSS framework
- **Font Awesome**: Icons
- **MediaRecorder API**: Audio recording

## Setup

1. Clone the repository
2. Install dependencies:
```bash
pip install -r requirements.txt
```

3. Set up environment variables in `.env`:
```env
OPENAI_API_KEY=your_api_key
OPENAI_ORG_ID=your_org_id  # Optional
SECRET_KEY=your_secret_key
```

4. Initialize the database:
```bash
python create_db.py
```

5. Run the application:
```bash
python appnolla1.py
```

## Project Structure

```
nolla-transcription-dashboard/
├── appnolla1.py           # Main Flask application
├── create_db.py           # Database initialization
├── requirements.txt       # Python dependencies
├── .env                   # Environment variables
├── static/
│   ├── js/
│   │   └── app.js        # Frontend JavaScript
│   └── images/           # Static images
├── templates/
│   ├── index.html        # Main application template
│   ├── login.html        # Login page
│   └── signup.html       # Signup page
└── temp/                 # Temporary audio files
```

## Key Components

### Authentication System
- User registration and login
- Secure password hashing
- Session management

### Audio Recording
- Browser-based audio recording
- Real-time timer display
- Patient consent toggle

### Transcription System
- Audio file handling
- OpenAI Whisper integration
- Speaker diarization processing

### Note Generation
- Multiple template support
- AI-powered note structuring
- Real-time template switching

### Letter Generation
- Context-aware letter creation
- Professional formatting
- Copy-to-clipboard functionality

## API Integration

### OpenAI APIs
1. **Whisper API**
   - Used for accurate speech-to-text transcription
   - Handles multiple languages
   - High accuracy for medical terminology

2. **GPT-3.5 API**
   - Generates structured clinical notes
   - Creates professional medical letters
   - Handles medical context and terminology

## Styling

The application uses a custom color scheme:
- Primary Dark: #1E341C
- Secondary Light: #A5E1A3
- Accent Green: #82F17E

UI components feature:
- Clean, minimal design
- Responsive layouts
- Smooth transitions
- Visual feedback for user actions

## Error Handling

- Rate limit handling for OpenAI API
- Audio recording fallbacks
- Graceful error messages
- Session persistence

## Future Enhancements

Potential areas for improvement:
- [ ] Enhanced error handling
- [ ] Additional note templates
- [ ] Export functionality for notes and letters
- [ ] Advanced audio processing
- [ ] Real-time collaboration features
- [ ] Analytics dashboard

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Acknowledgments

- OpenAI for their powerful APIs
- Flask and its extension authors
- The medical professionals who provided feedback
