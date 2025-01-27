import os
from flask import Flask, request, jsonify, render_template
from flask_cors import CORS
import openai
from dotenv import load_dotenv
import json

# Load environment variables from .env file
load_dotenv()

# Initialize Flask app
app = Flask(__name__)
CORS(app)

# Configure OpenAI API key
openai.api_key = os.getenv('OPENAI_API_KEY')

# Configure upload folder
UPLOAD_FOLDER = 'uploads'
if not os.path.exists(UPLOAD_FOLDER):
    os.makedirs(UPLOAD_FOLDER)
app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/transcribe', methods=['POST'])
def transcribe():
    try:
        if 'audio' not in request.files:
            return jsonify({'error': 'No audio file provided'}), 400
        
        audio_file = request.files['audio']
        if audio_file.filename == '':
            return jsonify({'error': 'No audio file selected'}), 400

        # Save the audio file temporarily
        temp_path = os.path.join(app.config['UPLOAD_FOLDER'], 'temp_audio.wav')
        audio_file.save(temp_path)

        # Transcribe the audio using OpenAI Whisper
        try:
            with open(temp_path, 'rb') as audio:
                transcript = openai.Audio.transcribe("whisper-1", audio)
                transcription = transcript["text"]

            # Generate SOAP note using GPT
            prompt = f"""Based on the following medical transcription, generate a SOAP note. 
            Format the response as a JSON object with keys: subjective, objective, assessment, and plan.
            
            Transcription: {transcription}"""

            completion = openai.ChatCompletion.create(
                model="gpt-3.5-turbo",
                messages=[{"role": "system", "content": "You are a medical assistant helping to generate SOAP notes from transcriptions."},
                         {"role": "user", "content": prompt}]
            )

            # Parse the SOAP note from the GPT response
            try:
                soap_note = json.loads(completion.choices[0].message.content)
            except json.JSONDecodeError:
                soap_note = None

            # Clean up temporary file
            os.remove(temp_path)

            return jsonify({
                'transcription': transcription,
                'soap_note': soap_note
            })

        except Exception as e:
            return jsonify({'error': str(e)}), 500

    except Exception as e:
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    app.run(debug=True, port=8082)