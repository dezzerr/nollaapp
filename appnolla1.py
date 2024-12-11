import os
from flask import Flask, request, jsonify, render_template, send_file, redirect, url_for, flash
from flask_cors import CORS
import openai
from flask_socketio import SocketIO
import base64
import tempfile
from dotenv import load_dotenv
import json
import re
from datetime import datetime
from pydub import AudioSegment
import io
from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
import asyncio
import concurrent.futures
from functools import partial
import time
import random
from flask_sqlalchemy import SQLAlchemy
from flask_login import LoginManager, UserMixin, login_user, login_required, logout_user, current_user
from werkzeug.security import generate_password_hash, check_password_hash
from flask import Response, stream_with_context
from datetime import timedelta

# Load environment variables from .env file
load_dotenv()

app = Flask(__name__, 
    static_url_path='',  # This makes static files available at root URL
    static_folder='static',  # This is the directory where static files are stored
    template_folder='templates'  # This is the directory where templates are stored
)
app.config['SECRET_KEY'] = os.environ.get('SECRET_KEY', 'your-secret-key-here')
# Database configuration
app.config['SQLALCHEMY_DATABASE_URI'] = os.getenv('DATABASE_URL', 'sqlite:///nolla.db')
if app.config['SQLALCHEMY_DATABASE_URI'].startswith('postgres://'):
    app.config['SQLALCHEMY_DATABASE_URI'] = app.config['SQLALCHEMY_DATABASE_URI'].replace('postgres://', 'postgresql://', 1)
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

CORS(app)
db = SQLAlchemy(app)
# Initialize Flask-SocketIO with gevent
socketio = SocketIO(app, async_mode='gevent', cors_allowed_origins="*")  
login_manager = LoginManager()
login_manager.init_app(app)
login_manager.login_view = 'login'

class User(UserMixin, db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    email = db.Column(db.String(120), unique=True, nullable=False)
    password_hash = db.Column(db.String(200), nullable=False)

    def set_password(self, password):
        self.password_hash = generate_password_hash(password)

    def check_password(self, password):
        return check_password_hash(self.password_hash, password)

@login_manager.user_loader
def load_user(user_id):
    return User.query.get(int(user_id))

@app.route('/login', methods=['GET', 'POST'])
def login():
    if current_user.is_authenticated:
        return redirect(url_for('index'))
    
    if request.method == 'POST':
        email = request.form.get('email')
        password = request.form.get('password')
        user = User.query.filter_by(email=email).first()
        
        if user and user.check_password(password):
            login_user(user)
            return redirect(url_for('index'))
        else:
            flash('Invalid email or password')
    
    return render_template('login.html')

@app.route('/signup', methods=['GET', 'POST'])
def signup():
    if current_user.is_authenticated:
        return redirect(url_for('index'))
    
    if request.method == 'POST':
        name = request.form.get('name')
        email = request.form.get('email')
        password = request.form.get('password')
        confirm_password = request.form.get('confirm_password')
        
        if password != confirm_password:
            flash('Passwords do not match')
            return render_template('signup.html')
        
        if User.query.filter_by(email=email).first():
            flash('Email already registered')
            return render_template('signup.html')
        
        user = User(name=name, email=email)
        user.set_password(password)
        db.session.add(user)
        db.session.commit()
        
        login_user(user)
        return redirect(url_for('index'))
    
    return render_template('signup.html')

@app.route('/logout')
@login_required
def logout():
    logout_user()
    return redirect(url_for('login'))

@app.route('/')
@login_required
def index():
    return render_template('index.html', user_name=current_user.name)

@app.route('/transcribe', methods=['POST'])
def transcribe():
    """Handle audio transcription requests"""
    try:
        print("Transcribe route called")
        if 'audio' not in request.files:
            print("No audio file in request")
            return jsonify({'error': 'No audio file provided'}), 400
            
        audio_file = request.files['audio']
        if not audio_file:
            print("Empty audio file")
            return jsonify({'error': 'Empty audio file'}), 400
            
        # Create temp directory if it doesn't exist
        if not os.path.exists('temp'):
            print("Creating temp directory")
            os.makedirs('temp')
        
        # Save the audio file temporarily with a unique name
        temp_path = os.path.join('temp', f"audio_{int(time.time())}.wav")
        print(f"Saving audio file to {temp_path}")
        audio_file.save(temp_path)
        
        if not os.path.exists(temp_path):
            print(f"Failed to save audio file at {temp_path}")
            return jsonify({'error': 'Failed to save audio file'}), 500
            
        print(f"Audio file saved successfully at {temp_path}")
        file_size = os.path.getsize(temp_path)
        print(f"Audio file size: {file_size} bytes")
        
        def generate():
            try:
                # Start transcription
                yield json.dumps({"status": "transcribing"}) + '\n'
                
                # Transcribe audio
                try:
                    print("Starting transcription...")
                    transcription_text = transcribe_audio(temp_path)
                    print(f"Transcription result: {transcription_text[:100]}...")
                    
                    if not transcription_text:
                        print("Empty transcription result")
                        raise Exception("Failed to transcribe audio")
                        
                    yield json.dumps({
                        "status": "processing",
                        "transcription": transcription_text
                    }) + '\n'
                    
                except Exception as e:
                    print(f"Transcription error: {str(e)}")
                    print(f"Error type: {type(e)}")
                    import traceback
                    print(f"Transcription error traceback: {traceback.format_exc()}")
                    yield json.dumps({
                        "status": "error",
                        "error": f"Transcription failed: {str(e)}"
                    }) + '\n'
                    return
                    
                try:
                    # Process with diarization
                    print("Starting diarization...")
                    diarized_content = process_with_diarization(transcription_text)
                    print("Diarization complete")
                    
                    # Get template type from request
                    template_type = request.form.get('template', 'soap')  # Default to SOAP if not specified
                    print(f"Using template type: {template_type}")
                    
                    # Generate notes
                    print("Generating clinical notes...")
                    notes = generate_note(diarized_content, template_type)
                    print("Notes generated")
                    
                    yield json.dumps({
                        "status": "complete",
                        "diarized_content": diarized_content,
                        "notes": notes
                    }) + '\n'
                    
                except Exception as e:
                    print(f"Processing error: {str(e)}")
                    print(f"Error type: {type(e)}")
                    import traceback
                    print(f"Processing error traceback: {traceback.format_exc()}")
                    yield json.dumps({
                        "status": "error",
                        "error": f"Processing failed: {str(e)}"
                    }) + '\n'
                
            except Exception as e:
                print(f"Generate function error: {str(e)}")
                print(f"Error type: {type(e)}")
                import traceback
                print(f"Generate function error traceback: {traceback.format_exc()}")
                yield json.dumps({
                    "status": "error",
                    "error": str(e)
                }) + '\n'
                
            finally:
                # Clean up temp file
                try:
                    if os.path.exists(temp_path):
                        os.remove(temp_path)
                        print(f"Cleaned up temp file: {temp_path}")
                except Exception as e:
                    print(f"Error cleaning up temp file: {str(e)}")
        
        return Response(stream_with_context(generate()), mimetype='text/event-stream')
        
    except Exception as e:
        print(f"Main route error: {str(e)}")
        print(f"Error type: {type(e)}")
        import traceback
        print(f"Main route error traceback: {traceback.format_exc()}")
        return jsonify({'error': str(e)}), 500

@app.route('/download', methods=['POST'])
@login_required
def download_notes():
    try:
        data = request.json
        
        # Create a temporary file for the PDF
        temp_pdf = tempfile.NamedTemporaryFile(delete=False, suffix='.pdf')
        
        # Create the PDF document
        doc = SimpleDocTemplate(
            temp_pdf.name,
            pagesize=letter,
            rightMargin=72,
            leftMargin=72,
            topMargin=72,
            bottomMargin=72
        )
        
        # Define styles
        styles = getSampleStyleSheet()
        title_style = ParagraphStyle(
            'CustomTitle',
            parent=styles['Heading1'],
            fontSize=16,
            spaceAfter=30
        )
        heading_style = ParagraphStyle(
            'CustomHeading',
            parent=styles['Heading2'],
            fontSize=12,
            spaceAfter=12,
            textColor=colors.HexColor('#1E341C')
        )
        normal_style = ParagraphStyle(
            'CustomNormal',
            parent=styles['Normal'],
            fontSize=10,
            spaceAfter=12
        )
        
        # Create the content
        content = []
        
        # Add title with current date
        current_date = datetime.now().strftime("%B %d, %Y")
        content.append(Paragraph(f"Medical Notes - {current_date}", title_style))
        content.append(Spacer(1, 12))
        
        # Add patient information
        content.append(Paragraph(f"Patient Name: {data.get('patientName', 'Anonymous')}", normal_style))
        content.append(Paragraph(f"Patient ID: {data.get('patientId', 'N/A')}", normal_style))
        content.append(Paragraph(f"Session Date: {data.get('sessionDate', current_date)}", normal_style))
        content.append(Spacer(1, 20))
        
        # Add notes based on template type
        notes = data.get('notes', {})
        template_type = data.get('type', 'SOAP')
        
        if template_type == 'SOAP':
            content.extend([
                Paragraph("SOAP Notes", heading_style),
                Paragraph("Subjective:", heading_style),
                Paragraph(notes.get('subjective', ''), normal_style),
                Paragraph("Objective:", heading_style),
                Paragraph(notes.get('objective', ''), normal_style),
                Paragraph("Assessment:", heading_style),
                Paragraph(notes.get('assessment', ''), normal_style),
                Paragraph("Plan:", heading_style),
                Paragraph(notes.get('plan', ''), normal_style)
            ])
        elif template_type == 'BIRP':
            content.extend([
                Paragraph("BIRP Notes", heading_style),
                Paragraph("Behavior:", heading_style),
                Paragraph(notes.get('behavior', ''), normal_style),
                Paragraph("Intervention:", heading_style),
                Paragraph(notes.get('intervention', ''), normal_style),
                Paragraph("Response:", heading_style),
                Paragraph(notes.get('response', ''), normal_style),
                Paragraph("Plan:", heading_style),
                Paragraph(notes.get('plan', ''), normal_style)
            ])
        elif template_type == 'DAP':
            content.extend([
                Paragraph("DAP Notes", heading_style),
                Paragraph("Data:", heading_style),
                Paragraph(notes.get('data', ''), normal_style),
                Paragraph("Assessment:", heading_style),
                Paragraph(notes.get('assessment', ''), normal_style),
                Paragraph("Plan:", heading_style),
                Paragraph(notes.get('plan', ''), normal_style)
            ])
        elif template_type == 'BASIC':
            content.extend([
                Paragraph("Basic Notes", heading_style),
                Paragraph("Presentation:", heading_style),
                Paragraph(notes.get('presentation', ''), normal_style),
                Paragraph("Mental State:", heading_style),
                Paragraph(notes.get('state', ''), normal_style),
                Paragraph("Assessment:", heading_style),
                Paragraph(notes.get('assessment', ''), normal_style),
                Paragraph("Themes:", heading_style),
                Paragraph(notes.get('themes', ''), normal_style),
                Paragraph("Treatment:", heading_style),
                Paragraph(notes.get('treatment', ''), normal_style),
                Paragraph("Progress:", heading_style),
                Paragraph(notes.get('progress', ''), normal_style)
            ])
        
        # Build the PDF
        doc.build(content)
        
        # Send the file
        return send_file(
            temp_pdf.name,
            mimetype='application/pdf',
            as_attachment=True,
            download_name=f"medical_notes_{datetime.now().strftime('%Y-%m-%d')}.pdf"
        )
        
    except Exception as e:
        print(f"Error generating PDF: {str(e)}")
        return jsonify({"error": str(e)}), 500
    
    finally:
        # Cleanup temporary file
        if 'temp_pdf' in locals():
            try:
                os.unlink(temp_pdf.name)
            except:
                pass

@app.route('/generate_letter', methods=['POST'])
def generate_letter_route():
    """Generate a clinical letter based on the request and transcript"""
    try:
        data = request.get_json()
        if not data or 'request' not in data or 'transcript' not in data:
            return jsonify({'error': 'Missing required fields'}), 400

        letter_request = data['request']
        transcript = data['transcript']

        # Generate the letter using GPT
        letter = generate_clinical_letter(letter_request, transcript)
        
        return jsonify({'letter': letter})
    except Exception as e:
        print(f"Error generating letter: {str(e)}")
        return jsonify({'error': str(e)}), 500

def generate_clinical_letter(letter_request, transcript, model="gpt-3.5-turbo"):
    """Generate a clinical letter using GPT"""
    try:
        # Prepare the prompt for GPT
        prompt = f"""You are a medical professional writing a clinical letter. 
        Based on the following transcript and request, generate a professional clinical letter.
        
        Request: {letter_request}
        
        Transcript of the session:
        {transcript}
        
        Please write a formal, professional clinical letter that addresses the request. 
        The letter should:
        1. Include today's date
        2. Have a professional letterhead structure
        3. Be clear and concise
        4. Use appropriate medical terminology
        5. Maintain patient confidentiality
        6. End with a professional signature block
        """

        # Call GPT for letter generation
        client = openai.OpenAI(
            api_key=os.getenv('OPENAI_API_KEY'),
            organization=os.getenv('OPENAI_ORG_ID')
        )
        
        response = client.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": "You are a medical professional writing a clinical letter."},
                {"role": "user", "content": prompt}
            ],
            temperature=0.7,
            max_tokens=1000
        )
        
        letter = response.choices[0].message.content.strip()
        return letter
        
    except Exception as e:
        print(f"Error in generate_clinical_letter: {str(e)}")
        raise Exception(f"Failed to generate letter: {str(e)}")

@socketio.on('audio_data')
def handle_audio_data(data):
    try:
        # Decode the base64 audio data
        audio_data = base64.b64decode(data.split(',')[1])
        
        # Save to temporary file with .wav extension
        with tempfile.NamedTemporaryFile(suffix='.wav', delete=False) as temp_audio:
            temp_audio.write(audio_data)
            temp_audio.flush()
            
            try:
                # Transcribe using Whisper API
                with open(temp_audio.name, 'rb') as audio_file:
                    transcript = openai.Audio.transcribe(
                        "whisper-1",
                        audio_file
                    )
                
                if transcript and transcript.get('text'):
                    # Process transcript with speaker diarization
                    diarized_transcript = process_with_diarization(transcript['text'])
                    
                    # Extract medical entities
                    medical_entities = extract_medical_entities(transcript['text'])
                    
                    # Generate SOAP note
                    soap_note = generate_note(diarized_transcript, 'soap')
                    
                    # Emit the processed data back to the client
                    socketio.emit('transcription', {
                        'diarized_text': diarized_transcript,
                        'medical_entities': medical_entities,
                        'summary': soap_note
                    })
                else:
                    print("No transcription result")
                    socketio.emit('error', {'error': 'No transcription result'})
                    
            except Exception as e:
                print(f"Transcription error: {str(e)}")
                socketio.emit('error', {'error': str(e)})
            
    except Exception as e:
        print(f"Error: {str(e)}")
        socketio.emit('error', {'error': str(e)})
    finally:
        # Clean up temporary file
        try:
            os.remove(temp_audio.name)
        except:
            pass

# Load OpenAI API key from environment variable
openai.api_key = os.getenv('OPENAI_API_KEY')
if not openai.api_key:
    raise ValueError("No OpenAI API key found. Please set the OPENAI_API_KEY environment variable.")

# Configure OpenAI client with organization settings
openai.organization = os.getenv('OPENAI_ORG_ID')  # Optional: Set if you have a specific org ID

def retry_with_exponential_backoff(
    func,
    initial_delay: float = 1,
    exponential_base: float = 2,
    max_retries: int = 3
):
    """Retry a function with exponential backoff."""
    def wrapper(*args, **kwargs):
        delay = initial_delay
        
        for i in range(max_retries):
            try:
                return func(*args, **kwargs)
            except openai.error.RateLimitError as e:
                if i == max_retries - 1:  # last attempt
                    raise
                
                # Add jitter to prevent thundering herd
                sleep_time = delay * (1 + random.uniform(-0.1, 0.1))
                time.sleep(sleep_time)
                delay *= exponential_base
            
            except Exception as e:
                raise
    
    return wrapper

@retry_with_exponential_backoff
def transcribe_audio(audio_file):
    """Transcribe audio using the faster Whisper model"""
    try:
        if not os.path.exists(audio_file):
            raise FileNotFoundError(f"Audio file not found: {audio_file}")
            
        if not openai.api_key:
            raise ValueError("OpenAI API key not found")
            
        print(f"Using OpenAI API key: {openai.api_key[:10]}...")
        print(f"Opening audio file: {audio_file}")
        
        try:
            client = openai.OpenAI(
                api_key=os.getenv('OPENAI_API_KEY'),
                organization=os.getenv('OPENAI_ORG_ID')  # Optional
            )
            
            with open(audio_file, "rb") as audio:
                print("Sending request to OpenAI API...")
                try:
                    transcript = client.audio.transcriptions.create(
                        model="whisper-1",
                        file=audio,
                        response_format="text",
                        temperature=0.3,
                        language="en"
                    )
                    print("Received response from OpenAI API")
                    
                    if not transcript:
                        raise Exception("Empty transcription result")
                        
                    return transcript
                    
                except openai.RateLimitError as e:
                    print(f"Rate limit exceeded: {str(e)}")
                    # Return a user-friendly error that will be shown in the UI
                    raise Exception("OpenAI API rate limit reached. Please try again in about an hour.")
                    
                except openai.APIError as e:
                    print(f"OpenAI API error: {str(e)}")
                    raise Exception(f"OpenAI API error: {str(e)}")
                
        except Exception as e:
            print(f"OpenAI API error: {str(e)}")
            print(f"Error type: {type(e)}")
            import traceback
            print(f"Traceback: {traceback.format_exc()}")
            raise
            
    except Exception as e:
        print(f"Error in transcribe_audio: {str(e)}")
        print(f"Error type: {type(e)}")
        import traceback
        print(f"Traceback: {traceback.format_exc()}")
        raise

@retry_with_exponential_backoff
def process_segment(segment, model="gpt-3.5-turbo"):
    """Process a single segment of text with GPT for faster processing"""
    try:
        response = openai.ChatCompletion.create(
            model=model,
            messages=[
                {"role": "system", "content": """You are a medical transcription assistant. 
                Identify if this segment is spoken by the Clinician or Patient based on the content and context.
                Return JSON in the format: {"speaker": "Clinician/Patient", "text": "text"}"""},
                {"role": "user", "content": segment}
            ],
            temperature=0.3,
            max_tokens=200
        )
        return json.loads(response.choices[0].message['content'])
    except Exception as e:
        print(f"Error processing segment: {str(e)}")
        return {"speaker": "Unknown", "text": segment}

def process_with_diarization(transcript_text):
    """Process transcript with parallel speaker diarization"""
    try:
        # Split transcript into smaller segments for parallel processing
        segments = [s.strip() for s in re.split('(?<=[.!?]) +', transcript_text) if s.strip()]
        
        # Process segments in parallel using thread pool
        with concurrent.futures.ThreadPoolExecutor(max_workers=3) as executor:
            processed_segments = list(executor.map(process_segment, segments))
        
        # Combine results
        return {
            "segments": [
                {
                    "speaker": seg["speaker"],
                    "text": seg["text"],
                    "timestamp": f"segment_{i}"
                }
                for i, seg in enumerate(processed_segments)
            ]
        }
    except Exception as e:
        print(f"Error in diarization: {str(e)}")
        return {"segments": [{"speaker": "Unknown", "text": transcript_text, "timestamp": "unknown"}]}

@retry_with_exponential_backoff
def generate_note(diarized_text, template_type, model="gpt-3.5-turbo"):
    """Generate clinical notes using GPT-3.5-turbo"""
    try:
        # Convert diarized text to a conversation format
        conversation = "\n".join([f"{seg['speaker']}: {seg['text']}" for seg in diarized_text['segments']])
        
        # Template-specific prompts and format instructions
        templates = {
            'soap': {
                'prompt': "Generate a SOAP note with Subjective, Objective, Assessment, and Plan sections.",
                'format': """Format the response as a JSON object with these exact keys:
                {
                    "subjective": "Patient's reported symptoms, concerns, and history",
                    "objective": "Observable findings and measurements",
                    "assessment": "Clinical assessment and diagnoses",
                    "plan": "Treatment plan and next steps"
                }"""
            },
            'birp': {
                'prompt': "Generate a BIRP note (Behavioral health note) with Behavior, Intervention, Response, and Plan sections.",
                'format': """Format the response as a JSON object with these exact keys:
                {
                    "behavior": "Observed behaviors and client statements",
                    "intervention": "Therapeutic interventions used",
                    "response": "Client's response to interventions",
                    "plan": "Future treatment plans and goals"
                }"""
            },
            'dap': {
                'prompt': "Generate a DAP note (Data, Assessment, Plan) for a mental health session.",
                'format': """Format the response as a JSON object with these exact keys:
                {
                    "data": "Objective and subjective observations",
                    "assessment": "Clinical interpretation and assessment",
                    "plan": "Treatment plan and next steps"
                }"""
            },
            'basic': {
                'prompt': "Generate a comprehensive mental health progress note.",
                'format': """Format the response as a JSON object with these exact keys:
                {
                    "presentation": "Client's presentation and appearance",
                    "state": "Mental state and mood observations",
                    "assessment": "Clinical assessment and current concerns",
                    "themes": "Main themes discussed in session",
                    "treatment": "Treatment approaches used",
                    "progress": "Progress towards treatment goals"
                }"""
            }
        }
        
        template = templates.get(template_type)
        if not template:
            raise ValueError(f"Unknown template type: {template_type}")
            
        try:
            client = openai.OpenAI(
                api_key=os.getenv('OPENAI_API_KEY'),
                organization=os.getenv('OPENAI_ORG_ID')
            )
            
            response = client.chat.completions.create(
                model=model,
                messages=[
                    {"role": "system", "content": f"You are a clinical note generator. {template['prompt']} {template['format']}"},
                    {"role": "user", "content": f"Generate clinical notes from this conversation:\n{conversation}"}
                ],
                temperature=0.3,
                max_tokens=1000
            )
            
            # Parse the response content as JSON
            try:
                note_content = json.loads(response.choices[0].message.content)
                return note_content
            except json.JSONDecodeError as e:
                print(f"Error parsing GPT response as JSON: {str(e)}")
                print(f"Raw response: {response.choices[0].message.content}")
                # If JSON parsing fails, try to extract sections manually
                content = response.choices[0].message.content
                if template_type == 'soap':
                    return extract_soap_sections(content)
                elif template_type == 'birp':
                    return extract_birp_sections(content)
                elif template_type == 'dap':
                    return extract_dap_sections(content)
                elif template_type == 'basic':
                    return extract_basic_sections(content)
                
        except Exception as e:
            print(f"OpenAI API error: {str(e)}")
            raise
            
    except Exception as e:
        print(f"Error generating notes: {str(e)}")
        print(f"Error type: {type(e)}")
        import traceback
        print(f"Traceback: {traceback.format_exc()}")
        raise

def extract_soap_sections(content):
    """Extract SOAP sections from text content"""
    sections = {
        'subjective': '',
        'objective': '',
        'assessment': '',
        'plan': ''
    }
    current_section = None
    
    for line in content.split('\n'):
        line = line.strip()
        lower_line = line.lower()
        
        if 'subjective' in lower_line and ':' in line:
            current_section = 'subjective'
            continue
        elif 'objective' in lower_line and ':' in line:
            current_section = 'objective'
            continue
        elif 'assessment' in lower_line and ':' in line:
            current_section = 'assessment'
            continue
        elif 'plan' in lower_line and ':' in line:
            current_section = 'plan'
            continue
            
        if current_section and line:
            sections[current_section] += line + '\n'
            
    return {k: v.strip() for k, v in sections.items()}

def extract_birp_sections(content):
    """Extract BIRP sections from text content"""
    sections = {
        'behavior': '',
        'intervention': '',
        'response': '',
        'plan': ''
    }
    current_section = None
    
    for line in content.split('\n'):
        line = line.strip()
        lower_line = line.lower()
        
        if 'behavior' in lower_line and ':' in line:
            current_section = 'behavior'
            continue
        elif 'intervention' in lower_line and ':' in line:
            current_section = 'intervention'
            continue
        elif 'response' in lower_line and ':' in line:
            current_section = 'response'
            continue
        elif 'plan' in lower_line and ':' in line:
            current_section = 'plan'
            continue
            
        if current_section and line:
            sections[current_section] += line + '\n'
            
    return {k: v.strip() for k, v in sections.items()}

def extract_dap_sections(content):
    """Extract DAP sections from text content"""
    sections = {
        'data': '',
        'assessment': '',
        'plan': ''
    }
    current_section = None
    
    for line in content.split('\n'):
        line = line.strip()
        lower_line = line.lower()
        
        if 'data' in lower_line and ':' in line:
            current_section = 'data'
            continue
        elif 'assessment' in lower_line and ':' in line:
            current_section = 'assessment'
            continue
        elif 'plan' in lower_line and ':' in line:
            current_section = 'plan'
            continue
            
        if current_section and line:
            sections[current_section] += line + '\n'
            
    return {k: v.strip() for k, v in sections.items()}

def extract_basic_sections(content):
    """Extract Basic note sections from text content"""
    sections = {
        'presentation': '',
        'state': '',
        'assessment': '',
        'themes': '',
        'treatment': '',
        'progress': ''
    }
    current_section = None
    
    for line in content.split('\n'):
        line = line.strip()
        lower_line = line.lower()
        
        if 'presentation' in lower_line and ':' in line:
            current_section = 'presentation'
            continue
        elif 'mental state' in lower_line and ':' in line:
            current_section = 'state'
            continue
        elif 'assessment' in lower_line and ':' in line:
            current_section = 'assessment'
            continue
        elif 'themes' in lower_line and ':' in line:
            current_section = 'themes'
            continue
        elif 'treatment' in lower_line and ':' in line:
            current_section = 'treatment'
            continue
        elif 'progress' in lower_line and ':' in line:
            current_section = 'progress'
            continue
            
        if current_section and line:
            sections[current_section] += line + '\n'
            
    return {k: v.strip() for k, v in sections.items()}

@app.route('/analytics')
@login_required
def analytics():
    return render_template('analytics.html')

@app.route('/api/analytics/data')
@login_required
def analytics_data():
    days = int(request.args.get('days', 7))
    
    # Mock data for demonstration
    daily_data = [
        {"date": (datetime.now() - timedelta(days=i)).strftime("%Y-%m-%d"), 
         "count": random.randint(1, 10)} 
        for i in range(days)
    ]
    
    template_data = [
        {"template": "SOAP", "count": random.randint(10, 50)},
        {"template": "BIRP", "count": random.randint(5, 30)},
        {"template": "DAP", "count": random.randint(5, 25)},
        {"template": "Basic", "count": random.randint(15, 40)}
    ]
    
    return jsonify({
        "daily_transcriptions": daily_data,
        "template_usage": template_data,
        "avg_duration": random.uniform(30, 120)
    })

if __name__ == '__main__':
    try:
        # Try to initialize OpenAI client first
        client = openai.OpenAI(
            api_key=os.getenv('OPENAI_API_KEY'),
            organization=os.getenv('OPENAI_ORG_ID')
        )
        print("OpenAI client initialized successfully")
        
        # Create the database tables
        with app.app_context():
            db.create_all()
        
        port = int(os.getenv('PORT', 8080))
        if os.getenv('FLASK_ENV') == 'development':
            socketio.run(app, debug=True, port=port, allow_unsafe_werkzeug=True)
        else:
            socketio.run(app, host='0.0.0.0', port=port, debug=False)
            
    except Exception as e:
        print(f"Failed to start server: {str(e)}")
        print(f"Error type: {type(e)}")
        import traceback
        print(f"Traceback: {traceback.format_exc()}")
