import os
from flask import Flask, request, jsonify, render_template, send_file, Response, stream_with_context
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

# Load environment variables from .env file
load_dotenv()

app = Flask(__name__)
CORS(app)
socketio = SocketIO(app, cors_allowed_origins="*")

# Create a thread pool for parallel processing
thread_pool = concurrent.futures.ThreadPoolExecutor(max_workers=3)

# Load OpenAI API key from environment variable
openai.api_key = os.getenv('OPENAI_API_KEY')
if not openai.api_key:
    raise ValueError("No OpenAI API key found. Please set the OPENAI_API_KEY environment variable.")

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/transcribe', methods=['POST'])
def transcribe():
    try:
        # Get the audio file and template type from the request
        audio_file = request.files.get('audio')
        template_type = request.form.get('template', 'soap')
        
        if not audio_file:
            return jsonify({'error': 'No audio file provided'}), 400
        
        # Save the audio file temporarily
        temp_path = "temp_audio.wav"
        audio_file.save(temp_path)
        
        def generate():
            try:
                # Start transcription
                yield json.dumps({"status": "transcribing"}) + '\n'
                
                # Transcribe audio
                transcription_text = transcribe_audio(temp_path)
                yield json.dumps({"status": "processing", "transcription": transcription_text}) + '\n'
                
                # Process with diarization
                diarized_content = process_with_diarization(transcription_text)
                yield json.dumps({"status": "diarizing", "diarized": diarized_content}) + '\n'
                
                # Generate notes based on template type
                note_generators = {
                    'soap': generate_soap_note,
                    'birp': generate_birp_note,
                    'dap': generate_dap_note,
                    'basic': generate_basic_note
                }
                
                notes = note_generators.get(template_type, generate_soap_note)(diarized_content)
                
                # Send final result
                yield json.dumps({
                    'status': 'complete',
                    'success': True,
                    'transcription': transcription_text,
                    'diarized_content': diarized_content,
                    'notes': notes,
                    'template_type': template_type
                }) + '\n'
                
            except Exception as e:
                yield json.dumps({'status': 'error', 'error': str(e)}) + '\n'
            
            finally:
                # Clean up the temporary file
                if os.path.exists(temp_path):
                    os.remove(temp_path)
        
        return Response(stream_with_context(generate()), mimetype='application/x-ndjson')
        
    except Exception as e:
        print(f"Error in transcribe route: {str(e)}")
        return jsonify({'error': str(e)}), 500

def transcribe_audio(audio_file):
    """Transcribe audio using the faster Whisper model"""
    with open(audio_file, "rb") as audio:
        transcript = openai.Audio.transcribe(
            "whisper-1",
            audio,
            response_format="text",
            temperature=0.3,
            language="en"
        )
    return transcript

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

def extract_medical_entities(text):
    """Extract medical entities from text using GPT"""
    response = openai.ChatCompletion.create(
        model="gpt-4",
        messages=[
            {"role": "system", "content": "You are a medical entity extractor. Identify and extract medical terms, symptoms, medications, and diagnoses from the text. Return them in JSON format with categories."},
            {"role": "user", "content": f"Extract medical entities from this text: {text}"}
        ],
        temperature=0.3,
        max_tokens=200
    )
    try:
        return json.loads(response.choices[0].message['content'])
    except:
        return {}

def generate_soap_note(diarized_text):
    """Generate SOAP note from diarized conversation"""
    # Convert diarized text to a single string for GPT
    conversation = "\n".join([f"{segment['speaker']}: {segment['text']}" for segment in diarized_text['segments']])
    
    response = openai.ChatCompletion.create(
        model="gpt-4",
        messages=[
            {"role": "system", "content": """You are a medical professional tasked with creating a SOAP note.
            Create a detailed SOAP note based on the conversation provided.
            Format your response as a JSON object with these keys:
            {
                "subjective": "Patient's symptoms, history, and complaints",
                "objective": "Observable findings and measurements",
                "assessment": "Diagnosis and interpretation",
                "plan": "Treatment plan and next steps"
            }"""},
            {"role": "user", "content": f"Generate a SOAP note from this conversation:\n{conversation}"}
        ],
        temperature=0.3,
        max_tokens=1000
    )
    
    try:
        return json.loads(response.choices[0].message['content'])
    except:
        return {
            "subjective": "",
            "objective": "",
            "assessment": "",
            "plan": ""
        }

def generate_birp_note(diarized_text):
    """Generate BIRP note from diarized conversation"""
    conversation = "\n".join([f"{segment['speaker']}: {segment['text']}" for segment in diarized_text['segments']])
    
    response = openai.ChatCompletion.create(
        model="gpt-4",
        messages=[
            {"role": "system", "content": """You are a medical transcription assistant. Generate a BIRP (Behavior, Intervention, Response, Plan) note from the conversation.
            Return the note in JSON format with these fields:
            {
                "behavior": "Client's behavior, affect, and presentation",
                "intervention": "Clinical interventions, techniques used",
                "response": "Client's response to interventions",
                "plan": "Treatment plan and next steps"
            }"""},
            {"role": "user", "content": f"Generate a BIRP note from this conversation:\n{conversation}"}
        ],
        temperature=0.3,
        max_tokens=1000
    )
    
    try:
        return json.loads(response.choices[0].message['content'])
    except Exception as e:
        print(f"Error generating BIRP note: {e}")
        return {
            "behavior": "",
            "intervention": "",
            "response": "",
            "plan": ""
        }

def generate_dap_note(diarized_text):
    """Generate DAP note from diarized conversation"""
    conversation = "\n".join([f"{segment['speaker']}: {segment['text']}" for segment in diarized_text['segments']])
    
    response = openai.ChatCompletion.create(
        model="gpt-4",
        messages=[
            {"role": "system", "content": """You are a medical transcription assistant. Generate a DAP (Data, Assessment, Plan) note from the conversation.
            Return the note in JSON format with these fields:
            {
                "data": "Objective and subjective data from the session",
                "assessment": "Clinical assessment and interpretation",
                "plan": "Treatment plan and next steps"
            }"""},
            {"role": "user", "content": f"Generate a DAP note from this conversation:\n{conversation}"}
        ],
        temperature=0.3,
        max_tokens=1000
    )
    
    try:
        return json.loads(response.choices[0].message['content'])
    except Exception as e:
        print(f"Error generating DAP note: {e}")
        return {
            "data": "",
            "assessment": "",
            "plan": ""
        }

def generate_basic_note(diarized_text):
    """Generate Basic note from diarized conversation"""
    conversation = "\n".join([f"{segment['speaker']}: {segment['text']}" for segment in diarized_text['segments']])
    
    response = openai.ChatCompletion.create(
        model="gpt-4",
        messages=[
            {"role": "system", "content": """You are a medical transcription assistant. Generate a Basic clinical note from the conversation.
            Return the note in JSON format with these fields:
            {
                "presentation": "Client's presentation and session format",
                "state": "Mental state and affect",
                "assessment": "Clinical assessment",
                "themes": "Main themes and issues discussed",
                "treatment": "Treatment approaches used",
                "progress": "Progress and observations"
            }"""},
            {"role": "user", "content": f"Generate a Basic note from this conversation:\n{conversation}"}
        ],
        temperature=0.3,
        max_tokens=1000
    )
    
    try:
        return json.loads(response.choices[0].message['content'])
    except Exception as e:
        print(f"Error generating Basic note: {e}")
        return {
            "presentation": "",
            "state": "",
            "assessment": "",
            "themes": "",
            "treatment": "",
            "progress": ""
        }

@app.route('/download', methods=['POST'])
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
        return jsonify({'error': str(e)}), 500
    
    finally:
        # Cleanup temporary file
        if 'temp_pdf' in locals():
            try:
                os.unlink(temp_pdf.name)
            except:
                pass

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
                    soap_note = generate_soap_note(diarized_transcript)
                    
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

if __name__ == '__main__':
    port = int(os.getenv('PORT', 8080))
    host = '0.0.0.0'
    debug = os.getenv('FLASK_ENV') != 'production'
    socketio.run(app, host=host, port=port, debug=debug, allow_unsafe_werkzeug=True)
