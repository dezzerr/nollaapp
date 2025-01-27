// DOM Elements
const recordButton = document.getElementById('recordButton');
const timer = document.getElementById('timer');
const consentToggle = document.getElementById('consentToggle');
const recordingStatus = document.getElementById('recordingStatus');
const transcriptionOutput = document.getElementById('transcriptionOutput');
const loadingTranscription = document.getElementById('loadingTranscription');
const transcriptTab = document.getElementById('transcriptTab');
const noteTab = document.getElementById('noteTab');
const transcriptPanel = document.getElementById('transcriptPanel');
const notePanel = document.getElementById('notePanel');
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

// Template elements
const templateSelect = document.getElementById('templateSelect');
const soapTemplate = document.getElementById('soapTemplate');
const birpTemplate = document.getElementById('birpTemplate');
const dapTemplate = document.getElementById('dapTemplate');
const basicTemplate = document.getElementById('basicTemplate');

let mediaRecorder;
let audioChunks = [];
let timerInterval;
let startTime;
let isRecording = false;

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
    const templates = {
        'soap': soapTemplate,
        'birp': birpTemplate,
        'dap': dapTemplate,
        'basic': basicTemplate
    };

    // Hide all templates
    Object.values(templates).forEach(template => {
        if (template) template.classList.add('hidden');
    });

    // Show selected template
    const selectedTemplate = templates[this.value];
    if (selectedTemplate) {
        selectedTemplate.classList.remove('hidden');
    }
});

// Transcription functions
async function sendAudioForTranscription(audioBlob) {
    try {
        // Show loading state
        document.getElementById('loadingTranscription').classList.remove('hidden');
        document.getElementById('transcriptionOutput').innerHTML = '';
        
        // Create form data
        const formData = new FormData();
        formData.append('audio', audioBlob);
        formData.append('template', templateSelect.value);

        // Send request
        const response = await fetch('/transcribe', {
            method: 'POST',
            body: formData
        });

        // Create a reader to read the stream
        const reader = response.body.getReader();
        const decoder = new TextDecoder();

        while (true) {
            const { value, done } = await reader.read();
            if (done) break;

            // Process each chunk
            const chunk = decoder.decode(value);
            const lines = chunk.split('\n').filter(line => line.trim());

            for (const line of lines) {
                try {
                    const data = JSON.parse(line);
                    
                    // Update UI based on status
                    switch (data.status) {
                        case 'transcribing':
                            document.getElementById('transcriptionOutput').innerHTML = 'Transcribing audio...';
                            break;
                            
                        case 'processing':
                            document.getElementById('transcriptionOutput').innerHTML = data.transcription;
                            break;
                            
                        case 'diarizing':
                            displayDiarizedTranscription(data.diarized);
                            break;
                            
                        case 'complete':
                            displayDiarizedTranscription(data.diarized_content);
                            updateNoteFields(data.notes);
                            break;
                            
                        case 'error':
                            throw new Error(data.error);
                    }
                } catch (e) {
                    console.error('Error processing chunk:', e);
                }
            }
        }
    } catch (error) {
        console.error('Error:', error);
        alert('Error processing audio: ' + error.message);
    } finally {
        // Hide loading state
        document.getElementById('loadingTranscription').classList.add('hidden');
    }
}

function displayDiarizedTranscription(diarizedContent) {
    transcriptionOutput.innerHTML = '';
    
    diarizedContent.segments.forEach(segment => {
        const speakerClass = segment.speaker.toLowerCase() === 'clinician'
                           ? 'speaker-therapist' 
                           : 'speaker-patient';
        
        const segmentDiv = document.createElement('div');
        segmentDiv.className = `speaker-segment ${speakerClass}`;
        
        segmentDiv.innerHTML = `
            <div class="speaker-label">${segment.speaker}</div>
            <div class="timestamp">${segment.timestamp}</div>
            <div class="mt-1">${segment.text}</div>
        `;
        
        transcriptionOutput.appendChild(segmentDiv);
    });
}

function updateNoteFields(notes) {
    if (!notes) return;

    // Clear all fields first
    const clearFields = () => {
        const textareas = document.querySelectorAll('textarea');
        textareas.forEach(textarea => textarea.value = '');
    };
    clearFields();

    // Show the correct template and populate fields
    const templates = {
        'soap': soapTemplate,
        'birp': birpTemplate,
        'dap': dapTemplate,
        'basic': basicTemplate
    };

    // Hide all templates first
    Object.values(templates).forEach(template => {
        if (template) template.classList.add('hidden');
    });

    // Show the selected template
    const selectedTemplate = templates[templateSelect.value];
    if (selectedTemplate) {
        selectedTemplate.classList.remove('hidden');
    }

    // Populate the fields based on template type
    switch (templateSelect.value) {
        case 'soap':
            if (subjectiveText) subjectiveText.value = notes.subjective || '';
            if (objectiveText) objectiveText.value = notes.objective || '';
            if (assessmentText) assessmentText.value = notes.assessment || '';
            if (planText) planText.value = notes.plan || '';
            break;
        case 'birp':
            if (behaviorText) behaviorText.value = notes.behavior || '';
            if (interventionText) interventionText.value = notes.intervention || '';
            if (responseText) responseText.value = notes.response || '';
            if (birpPlanText) birpPlanText.value = notes.plan || '';
            break;
        case 'dap':
            if (dataText) dataText.value = notes.data || '';
            if (dapAssessmentText) dapAssessmentText.value = notes.assessment || '';
            if (dapPlanText) dapPlanText.value = notes.plan || '';
            break;
        case 'basic':
            if (presentationText) presentationText.value = notes.presentation || '';
            if (stateText) stateText.value = notes.state || '';
            if (basicAssessmentText) basicAssessmentText.value = notes.assessment || '';
            if (themesText) themesText.value = notes.themes || '';
            if (treatmentText) treatmentText.value = notes.treatment || '';
            if (progressText) progressText.value = notes.progress || '';
            break;
    }
}

// Tab switching
function switchTab(tabName) {
    const tabs = {
        'transcript': { tab: transcriptTab, panel: transcriptPanel },
        'note': { tab: noteTab, panel: notePanel }
    };

    // Hide all panels and deselect all tabs
    Object.values(tabs).forEach(({ tab, panel }) => {
        if (tab && panel) {
            tab.setAttribute('aria-selected', 'false');
            tab.classList.remove('active');
            panel.classList.add('hidden');
        }
    });

    // Show selected tab and panel
    const selected = tabs[tabName];
    if (selected && selected.tab && selected.panel) {
        selected.tab.setAttribute('aria-selected', 'true');
        selected.tab.classList.add('active');
        selected.panel.classList.remove('hidden');
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
