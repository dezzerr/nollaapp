// DOM Elements
const recordButton = document.getElementById('recordButton');
const timer = document.getElementById('timer');
const consentToggle = document.getElementById('consentToggle');
const recordingStatus = document.getElementById('recordingStatus');
const transcriptionOutput = document.getElementById('transcriptionOutput');
const loadingTranscription = document.getElementById('loadingTranscription');
const transcriptTab = document.getElementById('transcriptTab');
const noteTab = document.getElementById('noteTab');
const letterTab = document.getElementById('letterTab');
const transcriptPanel = document.getElementById('transcriptPanel');
const notePanel = document.getElementById('notePanel');
const letterPanel = document.getElementById('letterPanel');
const subjectiveText = document.getElementById('subjectiveText');
const objectiveText = document.getElementById('objectiveText');
const assessmentText = document.getElementById('assessmentText');
const planText = document.getElementById('planText');
const behaviorText = document.getElementById('behaviorText');
const interventionText = document.getElementById('interventionText');
const responseText = document.getElementById('responseText');
const birpPlanText = document.getElementById('birpPlanText');
const dataText = document.getElementById('dataText');
const dapAssessmentText = document.getElementById('dapAssessmentText');
const dapPlanText = document.getElementById('dapPlanText');
const presentationText = document.getElementById('presentationText');
const stateText = document.getElementById('stateText');
const basicAssessmentText = document.getElementById('basicAssessmentText');
const themesText = document.getElementById('themesText');
const treatmentText = document.getElementById('treatmentText');
const progressText = document.getElementById('progressText');
const letterRequest = document.getElementById('letterRequest');
const generateLetterBtn = document.getElementById('generateLetterBtn');
const letterOutput = document.getElementById('letterOutput');
const letterContent = document.getElementById('letterContent');

let mediaRecorder;
let audioChunks = [];
let timerInterval;
let startTime;
let isRecording = false;

// Template elements
const templateSelect = document.getElementById('templateSelect');
const soapTemplate = document.getElementById('soapTemplate');
const birpTemplate = document.getElementById('birpTemplate');
const dapTemplate = document.getElementById('dapTemplate');
const basicTemplate = document.getElementById('basicTemplate');

// Initialize MediaRecorder
async function initializeRecorder() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaRecorder = new MediaRecorder(stream);
        
        mediaRecorder.ondataavailable = (event) => {
            audioChunks.push(event.data);
        };

        mediaRecorder.onstop = async () => {
            const audioBlob = new Blob(audioChunks, { type: 'audio/wav' });
            await sendAudioForTranscription(audioBlob);
            audioChunks = [];
        };

        recordButton.disabled = false;
    } catch (error) {
        console.error('Error accessing microphone:', error);
        alert('Error accessing microphone. Please ensure microphone permissions are granted.');
    }
}

// Timer functions
function startTimer() {
    startTime = Date.now();
    timerInterval = setInterval(updateTimer, 1000);
}

function stopTimer() {
    clearInterval(timerInterval);
    timer.textContent = '0:00';
}

function updateTimer() {
    const elapsedTime = Math.floor((Date.now() - startTime) / 1000);
    const minutes = Math.floor(elapsedTime / 60);
    const seconds = elapsedTime % 60;
    timer.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

// Recording functions
function startRecording() {
    if (!consentToggle.checked) {
        alert('Please confirm patient consent before recording.');
        return;
    }

    isRecording = true;
    recordButton.innerHTML = '<i class="fas fa-stop"></i><span>Stop Recording</span>';
    recordButton.classList.add('recording');
    recordingStatus.classList.remove('hidden');
    mediaRecorder.start();
    startTimer();
}

function stopRecording() {
    isRecording = false;
    recordButton.innerHTML = '<i class="fas fa-microphone"></i><span>Start Recording</span>';
    recordButton.classList.remove('recording');
    recordingStatus.classList.add('hidden');
    mediaRecorder.stop();
    stopTimer();
    
    // Switch to transcript tab and show loading immediately
    switchTab('transcript');
    loadingTranscription.classList.remove('hidden');
    transcriptionOutput.innerHTML = '';
}

// Template switching
templateSelect.addEventListener('change', function() {
    // Hide all templates first
    document.getElementById('soapTemplate').classList.add('hidden');
    document.getElementById('birpTemplate').classList.add('hidden');
    document.getElementById('dapTemplate').classList.add('hidden');
    document.getElementById('basicTemplate').classList.add('hidden');
    
    // Show selected template
    const selectedTemplate = document.getElementById(`${this.value}Template`);
    if (selectedTemplate) {
        selectedTemplate.classList.remove('hidden');
    }
});

// Transcription functions
async function sendAudioForTranscription(audioBlob) {
    try {
        // Show loading state
        document.getElementById('loadingTranscription').classList.remove('hidden');
        document.getElementById('transcriptionOutput').innerHTML = 'Starting transcription...';
        
        // Create form data
        const formData = new FormData();
        formData.append('audio', audioBlob);
        formData.append('template', templateSelect.value);

        // Send request
        const response = await fetch('/transcribe', {
            method: 'POST',
            body: formData
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
        }

        // Create a reader to read the stream
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        try {
            while (true) {
                const { value, done } = await reader.read();
                
                if (done) {
                    // Process any remaining data in buffer
                    if (buffer.trim()) {
                        try {
                            const data = JSON.parse(buffer.trim());
                            await processTranscriptionData(data);
                        } catch (e) {
                            console.error('Error processing final chunk:', e);
                        }
                    }
                    break;
                }

                // Decode the chunk and add to buffer
                buffer += decoder.decode(value, { stream: true });
                
                // Process complete lines
                const lines = buffer.split('\n');
                buffer = lines.pop() || ''; // Keep the last incomplete line in buffer

                for (const line of lines) {
                    if (line.trim()) {
                        try {
                            const data = JSON.parse(line.trim());
                            await processTranscriptionData(data);
                        } catch (e) {
                            console.error('Error processing chunk:', e);
                        }
                    }
                }
            }
        } finally {
            reader.releaseLock();
        }
    } catch (error) {
        console.error('Error:', error);
        document.getElementById('transcriptionOutput').innerHTML = `Error: ${error.message}`;
    } finally {
        // Hide loading state
        document.getElementById('loadingTranscription').classList.add('hidden');
    }
}

async function processTranscriptionData(data) {
    switch (data.status) {
        case 'transcribing':
            document.getElementById('transcriptionOutput').innerHTML = 'Transcribing audio...';
            break;
            
        case 'processing':
            document.getElementById('transcriptionOutput').innerHTML = data.transcription;
            break;
            
        case 'diarizing':
            if (data.diarized) {
                displayDiarizedTranscription(data.diarized);
            }
            break;
            
        case 'complete':
            if (data.diarized_content) {
                displayDiarizedTranscription(data.diarized_content);
            }
            if (data.notes) {
                updateNoteFields(data.notes);
            }
            break;
            
        case 'error':
            throw new Error(data.error || 'Unknown error occurred');
    }
}

function displayDiarizedTranscription(diarizedContent) {
    const transcriptionOutput = document.getElementById('transcriptionOutput');
    transcriptionOutput.innerHTML = '';

    if (!diarizedContent || !diarizedContent.segments) {
        console.error('Invalid diarized content structure:', diarizedContent);
        return;
    }

    diarizedContent.segments.forEach((segment) => {
        if (!segment.text.trim()) return;

        const lineElement = document.createElement('div');
        lineElement.className = 'transcription-line';
        
        // Add transcription text
        const textDiv = document.createElement('div');
        textDiv.className = 'transcription-text';
        textDiv.textContent = segment.text;
        lineElement.appendChild(textDiv);
        
        transcriptionOutput.appendChild(lineElement);
    });
    
    // Hide loading indicator
    document.getElementById('loadingTranscription').classList.add('hidden');
}

function formatTimestamp(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

function updateNoteFields(notes) {
    if (!notes) return;

    const template = templateSelect.value;
    
    switch (template) {
        case 'soap':
            if (notes.subjective) subjectiveText.value = notes.subjective;
            if (notes.objective) objectiveText.value = notes.objective;
            if (notes.assessment) assessmentText.value = notes.assessment;
            if (notes.plan) planText.value = notes.plan;
            break;
            
        case 'birp':
            if (notes.behavior) behaviorText.value = notes.behavior;
            if (notes.intervention) interventionText.value = notes.intervention;
            if (notes.response) responseText.value = notes.response;
            if (notes.plan) birpPlanText.value = notes.plan;
            break;
            
        case 'dap':
            if (notes.data) dataText.value = notes.data;
            if (notes.assessment) dapAssessmentText.value = notes.assessment;
            if (notes.plan) dapPlanText.value = notes.plan;
            break;
            
        case 'basic':
            if (notes.presentation) presentationText.value = notes.presentation;
            if (notes.state) stateText.value = notes.state;
            if (notes.assessment) basicAssessmentText.value = notes.assessment;
            if (notes.plan) basicPlanText.value = notes.plan;
            break;
    }
    
    // Switch to note tab after updating fields
    switchTab('note');
}

// Tab switching
function switchTab(tabName) {
    // Remove active class from all tabs and panels
    const tabs = [transcriptTab, noteTab, letterTab];
    const panels = [transcriptPanel, notePanel, letterPanel];
    
    tabs.forEach(tab => {
        tab.classList.remove('active');
        tab.classList.remove('text-primary-dark');
        tab.classList.remove('border-accent-green');
        tab.setAttribute('aria-selected', 'false');
    });
    
    panels.forEach(panel => panel.classList.add('hidden'));
    
    // Add active class to selected tab and show corresponding panel
    switch (tabName) {
        case 'transcript':
            transcriptTab.classList.add('active', 'text-primary-dark', 'border-accent-green');
            transcriptTab.setAttribute('aria-selected', 'true');
            transcriptPanel.classList.remove('hidden');
            break;
        case 'note':
            noteTab.classList.add('active', 'text-primary-dark', 'border-accent-green');
            noteTab.setAttribute('aria-selected', 'true');
            notePanel.classList.remove('hidden');
            break;
        case 'letter':
            letterTab.classList.add('active', 'text-primary-dark', 'border-accent-green');
            letterTab.setAttribute('aria-selected', 'true');
            letterPanel.classList.remove('hidden');
            break;
    }
}

// Letter generation
async function generateLetter() {
    if (!letterRequest.value.trim()) {
        alert('Please enter a letter request');
        return;
    }

    try {
        generateLetterBtn.disabled = true;
        document.getElementById('letterContent').innerHTML = 'Generating letter...';
        letterOutput.classList.remove('hidden');

        const response = await fetch('/generate_letter', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                request: letterRequest.value,
                transcript: transcriptionOutput.innerHTML
            })
        });

        if (!response.ok) {
            throw new Error('Failed to generate letter');
        }

        const data = await response.json();
        document.getElementById('letterContent').innerHTML = data.letter;
    } catch (error) {
        console.error('Error:', error);
        document.getElementById('letterContent').innerHTML = `Error: ${error.message}`;
    } finally {
        generateLetterBtn.disabled = false;
    }
}

async function copyLetter() {
    const letterContent = document.getElementById('letterContent').innerText;
    try {
        await navigator.clipboard.writeText(letterContent);
        const copyButton = document.querySelector('.copy-button');
        const originalIcon = copyButton.innerHTML;
        copyButton.innerHTML = '<i class="fas fa-check"></i>';
        setTimeout(() => {
            copyButton.innerHTML = originalIcon;
        }, 2000);
    } catch (err) {
        console.error('Failed to copy text: ', err);
    }
}

// Event Listeners
recordButton.addEventListener('click', () => {
    if (!isRecording) {
        startRecording();
    } else {
        stopRecording();
    }
});

transcriptTab.addEventListener('click', () => switchTab('transcript'));
noteTab.addEventListener('click', () => switchTab('note'));
letterTab.addEventListener('click', () => switchTab('letter'));
generateLetterBtn.addEventListener('click', generateLetter);
document.querySelector('.copy-button').addEventListener('click', copyLetter);

// New Session functionality
document.getElementById('newSessionBtn').addEventListener('click', () => {
    // Clear all text areas
    const textareas = document.querySelectorAll('textarea');
    textareas.forEach(textarea => textarea.value = '');

    // Clear transcription output
    transcriptionOutput.innerHTML = '';

    // Reset template to default (SOAP)
    templateSelect.value = 'soap';
    
    // Show SOAP template and hide others
    const templates = {
        'soap': soapTemplate,
        'birp': birpTemplate,
        'dap': dapTemplate,
        'basic': basicTemplate
    };
    
    Object.values(templates).forEach(template => {
        if (template) template.classList.add('hidden');
    });
    
    if (soapTemplate) soapTemplate.classList.remove('hidden');

    // Switch to transcript tab
    switchTab('transcript');

    // Reset recording state if needed
    if (isRecording) {
        stopRecording();
    }
    
    // Reset consent toggle
    if (consentToggle) consentToggle.checked = false;
});

// Download functionality
document.getElementById('downloadNotesBtn').addEventListener('click', async () => {
    try {
        // Get the current template type
        const templateType = templateSelect.value;
        
        // Gather notes based on template type
        let notes = {};
        switch (templateType) {
            case 'soap':
                notes = {
                    type: 'SOAP',
                    subjective: subjectiveText.value,
                    objective: objectiveText.value,
                    assessment: assessmentText.value,
                    plan: planText.value
                };
                break;
            case 'birp':
                notes = {
                    type: 'BIRP',
                    behavior: behaviorText.value,
                    intervention: interventionText.value,
                    response: responseText.value,
                    plan: birpPlanText.value
                };
                break;
            case 'dap':
                notes = {
                    type: 'DAP',
                    data: dataText.value,
                    assessment: dapAssessmentText.value,
                    plan: dapPlanText.value
                };
                break;
            case 'basic':
                notes = {
                    type: 'Basic',
                    presentation: presentationText.value,
                    state: stateText.value,
                    assessment: basicAssessmentText.value,
                    themes: themesText.value,
                    treatment: treatmentText.value,
                    progress: progressText.value
                };
                break;
        }

        // Send request to download endpoint
        const response = await fetch('/download', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                type: templateType.toUpperCase(),
                patientName: document.getElementById('patientName').value || 'Anonymous',
                patientId: 'NOL-2023-001',
                sessionDate: document.getElementById('sessionDate').value || new Date().toISOString().split('T')[0],
                notes: notes
            })
        });

        if (response.ok) {
            // Create a blob from the PDF data
            const blob = await response.blob();
            
            // Create a date string for the filename
            const date = new Date().toISOString().split('T')[0];
            
            // Create a download link
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `medical_notes_${date}.pdf`;
            
            // Trigger download
            document.body.appendChild(a);
            a.click();
            
            // Cleanup
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
        } else {
            throw new Error('Failed to generate PDF');
        }
    } catch (error) {
        console.error('Error downloading notes:', error);
        alert('Error downloading notes: ' + error.message);
    }
});

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    initializeRecorder();
    switchTab('transcript'); // Start with transcript tab active
});
