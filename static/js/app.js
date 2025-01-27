// DOM Elements
const recordButton = document.getElementById('recordButton');
const timer = document.getElementById('timer');
const consentToggle = document.getElementById('consentToggle');
const recordingStatus = document.getElementById('recordingStatus');
const transcriptionOutput = document.getElementById('transcriptionOutput');
const loadingTranscription = document.getElementById('loadingTranscription');
const transcriptTab = document.getElementById('transcriptTab');
const notesTab = document.getElementById('notesTab');
const letterTab = document.getElementById('letterTab');
const transcriptPanel = document.getElementById('transcriptPanel');
const notesPanel = document.getElementById('notesPanel');
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
const letterOutputContainer = document.getElementById('letterOutputContainer');
const copyLetterBtn = document.getElementById('copyLetterBtn');
const downloadLetterBtn = document.getElementById('downloadLetterBtn');
const templateSelect = document.getElementById('templateSelect');
const generateNotesBtn = document.getElementById('generateNotesBtn');
const saveNotesBtn = document.getElementById('saveNotesBtn');
const soapTemplate = document.getElementById('soapTemplate');
const birpTemplate = document.getElementById('birpTemplate');
const dapTemplate = document.getElementById('dapTemplate');
const basicTemplate = document.getElementById('basicTemplate');

let mediaRecorder;
let audioChunks = [];
let isRecording = false;
let startTime;
let timerInterval;

// Template elements

// Wait for DOM to be fully loaded
document.addEventListener('DOMContentLoaded', () => {
    // Initialize recording capability
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        navigator.mediaDevices.getUserMedia({ audio: true })
            .then(stream => {
                console.log('Microphone access granted');
                mediaRecorder = new MediaRecorder(stream);
                if (recordButton) recordButton.disabled = false;

                mediaRecorder.ondataavailable = event => {
                    audioChunks.push(event.data);
                };

                mediaRecorder.onstop = async () => {
                    const audioBlob = new Blob(audioChunks, { type: 'audio/wav' });
                    await uploadAudio(audioBlob);
                    audioChunks = [];
                };
            })
            .catch(error => {
                console.error('Error accessing microphone:', error);
                if (recordButton) {
                    recordButton.disabled = true;
                    recordButton.title = 'Microphone access denied';
                }
                alert('Please enable microphone access to use the recording feature.');
            });
    } else {
        console.error('MediaDevices API not supported');
        if (recordButton) {
            recordButton.disabled = true;
            recordButton.title = 'Recording not supported in this browser';
        }
    }

    // Record button click handler
    if (recordButton) {
        recordButton.addEventListener('click', () => {
            if (!consentToggle || !consentToggle.checked) {
                alert('Please confirm patient consent before recording');
                return;
            }

            if (!isRecording) {
                // Start recording
                mediaRecorder.start();
                isRecording = true;
                startTime = Date.now();
                recordButton.innerHTML = '<i class="fas fa-stop"></i><span class="ml-2">Stop Recording</span>';
                recordButton.classList.remove('bg-primary');
                recordButton.classList.add('bg-red-500');
                if (recordingStatus) recordingStatus.classList.remove('hidden');
                startTimer();
            } else {
                // Stop recording
                mediaRecorder.stop();
                isRecording = false;
                recordButton.innerHTML = '<i class="fas fa-microphone"></i><span class="ml-2">Start Recording</span>';
                recordButton.classList.remove('bg-red-500');
                recordButton.classList.add('bg-primary');
                if (recordingStatus) recordingStatus.classList.add('hidden');
                stopTimer();
            }
        });
    }

    // Timer functions
    function startTimer() {
        if (!timer) return;
        timerInterval = setInterval(() => {
            const elapsed = Math.floor((Date.now() - startTime) / 1000);
            const minutes = Math.floor(elapsed / 60);
            const seconds = elapsed % 60;
            timer.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
        }, 1000);
    }

    function stopTimer() {
        clearInterval(timerInterval);
        if (timer) timer.textContent = '0:00';
    }

    // Upload audio function
    async function uploadAudio(audioBlob) {
        if (loadingTranscription) loadingTranscription.classList.remove('hidden');
        if (transcriptionOutput) transcriptionOutput.innerHTML = 'Starting transcription...';
        
        try {
            const formData = new FormData();
            formData.append('audio', audioBlob, 'recording.wav');
            if (templateSelect) {
                formData.append('template', templateSelect.value);
            }

            const response = await fetch('/transcribe', {
                method: 'POST',
                body: formData
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';

            while (true) {
                const { value, done } = await reader.read();
                
                if (done) break;
                
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
                            console.error('Error processing line:', e, 'Line:', line);
                        }
                    }
                }
            }

            // Process any remaining data in buffer
            if (buffer.trim()) {
                try {
                    const data = JSON.parse(buffer.trim());
                    await processTranscriptionData(data);
                } catch (e) {
                    console.error('Error processing final data:', e);
                }
            }

        } catch (error) {
            console.error('Transcription error:', error);
            if (transcriptionOutput) {
                transcriptionOutput.innerHTML = `
                    <div class="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative">
                        <strong class="font-bold">Error:</strong>
                        <span class="block sm:inline">Failed to process audio: ${error.message}</span>
                    </div>
                `;
            }
        } finally {
            if (loadingTranscription) loadingTranscription.classList.add('hidden');
        }
    }

    // Process transcription data
    async function processTranscriptionData(data) {
        if (!transcriptionOutput) return;

        switch (data.status) {
            case 'transcribing':
                transcriptionOutput.innerHTML = 'Transcribing audio...';
                break;

            case 'processing':
                transcriptionOutput.innerHTML = data.transcription || 'Processing transcription...';
                break;

            case 'diarizing':
                if (data.diarized) {
                    displayDiarizedContent(data.diarized);
                }
                break;

            case 'complete':
                if (data.diarized_content) {
                    displayDiarizedContent(data.diarized_content);
                }
                if (data.notes) {
                    updateNoteFields(data.notes);
                }
                break;

            case 'error':
                console.error('Transcription error:', data.error);
                transcriptionOutput.innerHTML = `
                    <div class="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative">
                        <strong class="font-bold">Error:</strong>
                        <span class="block sm:inline">${data.error}</span>
                    </div>
                `;
                break;

            default:
                console.warn('Unknown status:', data.status);
        }
    }

    function displayDiarizedContent(content) {
        if (!transcriptionOutput) return;
        if (!content || !content.segments) {
            console.error('Invalid diarized content:', content);
            return;
        }

        let html = '';
        content.segments.forEach(segment => {
            const bubbleClass = segment.speaker === 'Clinician' ? 'clinician-bubble' : 'patient-bubble';
            html += `
                <div class="${bubbleClass} p-4 rounded-xl shadow-sm mb-4">
                    <div class="font-medium mb-1">${segment.speaker}</div>
                    <div>${segment.text}</div>
                </div>
            `;
        });
        transcriptionOutput.innerHTML = html;
    }

    function updateNoteFields(notes) {
        if (!notes) return;
        const template = templateSelect.value;
        
        switch (template) {
            case 'soap':
                const subjectiveText = document.getElementById('subjectiveText');
                const objectiveText = document.getElementById('objectiveText');
                const assessmentText = document.getElementById('assessmentText');
                const planText = document.getElementById('planText');
                
                if (subjectiveText) subjectiveText.value = notes.subjective || '';
                if (objectiveText) objectiveText.value = notes.objective || '';
                if (assessmentText) assessmentText.value = notes.assessment || '';
                if (planText) planText.value = notes.plan || '';
                break;
                
            // Add other template cases as needed
        }
        
        // Switch to note tab after updating fields
        switchTab('notes');
    }

    // Tab switching
    function switchTab(tabName) {
        // Hide all panels
        const panels = ['transcriptPanel', 'notesPanel', 'letterPanel'];
        panels.forEach(panel => {
            const element = document.getElementById(panel);
            if (element) {
                element.classList.add('hidden');
            }
        });

        // Remove active state from all tabs
        const tabs = ['transcriptTab', 'notesTab', 'letterTab'];
        tabs.forEach(tab => {
            const element = document.getElementById(tab);
            if (element) {
                element.classList.remove('text-primary', 'border-accent');
                element.classList.add('text-gray-500', 'border-transparent');
            }
        });

        // Show selected panel and activate tab
        const selectedPanel = document.getElementById(`${tabName}Panel`);
        const selectedTab = document.getElementById(`${tabName}Tab`);
        
        if (selectedPanel) {
            selectedPanel.classList.remove('hidden');
        }
        
        if (selectedTab) {
            selectedTab.classList.remove('text-gray-500', 'border-transparent');
            selectedTab.classList.add('text-primary', 'border-accent');
        }
    }

    // Add tab event listeners
    if (transcriptTab) transcriptTab.addEventListener('click', () => switchTab('transcript'));
    if (notesTab) notesTab.addEventListener('click', () => switchTab('notes'));
    if (letterTab) letterTab.addEventListener('click', () => switchTab('letter'));

    // Template switching
    function updateTemplateVisibility() {
        const selectedTemplate = templateSelect.value;
        const templates = ['soapTemplate', 'birpTemplate', 'dapTemplate', 'basicTemplate'];
        
        templates.forEach(template => {
            const element = document.getElementById(template);
            if (element) {
                if (template === `${selectedTemplate}Template`) {
                    element.classList.remove('hidden');
                } else {
                    element.classList.add('hidden');
                }
            }
        });
    }

    // Add template change listener
    if (templateSelect) {
        templateSelect.addEventListener('change', updateTemplateVisibility);
    }

    // Start with transcript tab active
    switchTab('transcript');

    // Letter Generation Functionality
    const letterRequestInput = document.getElementById('letterRequest');
    const generateLetterBtn = document.getElementById('generateLetterBtn');
    const letterOutput = document.getElementById('letterOutput');
    const letterOutputContainer = document.getElementById('letterOutputContainer');
    const copyLetterBtn = document.getElementById('copyLetterBtn');
    const downloadLetterBtn = document.getElementById('downloadLetterBtn');

    if (generateLetterBtn) {
        generateLetterBtn.addEventListener('click', async () => {
            try {
                if (!letterRequestInput.value.trim()) {
                    showError('Please enter a letter request');
                    return;
                }

                generateLetterBtn.disabled = true;
                generateLetterBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Generating...';
                letterOutputContainer.classList.add('hidden');

                const response = await fetch('/generate_letter', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        request: letterRequestInput.value,
                        transcript: transcriptionOutput ? transcriptionOutput.textContent : ''
                    })
                });

                if (!response.ok) {
                    const data = await response.json();
                    throw new Error(data.error || 'Failed to generate letter');
                }

                const data = await response.json();
                if (typeof data.letter === 'string') {
                    letterOutput.value = data.letter;
                    letterOutputContainer.classList.remove('hidden');
                    copyLetterBtn.disabled = false;
                    downloadLetterBtn.disabled = false;
                    showSuccess('Letter generated successfully!');
                } else {
                    throw new Error('Invalid letter format received from server');
                }
            } catch (error) {
                showError('Error generating letter: ' + error.message);
            } finally {
                generateLetterBtn.disabled = false;
                generateLetterBtn.innerHTML = 'Generate Letter';
            }
        });
    }

    if (copyLetterBtn) {
        copyLetterBtn.addEventListener('click', async () => {
            try {
                await navigator.clipboard.writeText(letterOutput.value);
                const originalText = copyLetterBtn.innerHTML;
                copyLetterBtn.innerHTML = '<i class="fas fa-check mr-2"></i>Copied!';
                showSuccess('Letter copied to clipboard!');
                setTimeout(() => {
                    copyLetterBtn.innerHTML = originalText;
                }, 2000);
            } catch (error) {
                showError('Error copying letter: ' + error.message);
            }
        });
    }

    if (downloadLetterBtn) {
        downloadLetterBtn.addEventListener('click', async () => {
            try {
                downloadLetterBtn.disabled = true;
                downloadLetterBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Downloading...';

                const response = await fetch('/download_letter', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        letter: letterOutput.value
                    })
                });

                if (!response.ok) {
                    const data = await response.json();
                    throw new Error(data.error || 'Error downloading letter');
                }

                const blob = await response.blob();
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `clinical_letter_${new Date().toISOString().split('T')[0]}.pdf`;
                document.body.appendChild(a);
                a.click();
                window.URL.revokeObjectURL(url);
                document.body.removeChild(a);

                showSuccess('Letter downloaded successfully!');
            } catch (error) {
                showError('Error downloading letter: ' + error.message);
            } finally {
                downloadLetterBtn.disabled = false;
                downloadLetterBtn.innerHTML = '<i class="fas fa-download mr-2"></i>Download PDF';
            }
        });
    }

    // Generate Notes Functionality
    if (generateNotesBtn) {
        generateNotesBtn.addEventListener('click', async () => {
            try {
                generateNotesBtn.disabled = true;
                generateNotesBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Generating...';

                const template = templateSelect.value;
                const transcriptContent = transcriptionOutput ? transcriptionOutput.textContent : '';

                const response = await fetch('/generate_notes', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        transcript: transcriptContent,
                        template: template
                    })
                });

                if (!response.ok) {
                    throw new Error('Failed to generate notes');
                }

                const data = await response.json();
                
                // Update the appropriate template fields
                switch (template) {
                    case 'soap':
                        if (subjectiveText) subjectiveText.value = data.sections.subjective || '';
                        if (objectiveText) objectiveText.value = data.sections.objective || '';
                        if (assessmentText) assessmentText.value = data.sections.assessment || '';
                        if (planText) planText.value = data.sections.plan || '';
                        break;
                    case 'birp':
                        if (behaviorText) behaviorText.value = data.sections.behavior || '';
                        if (interventionText) interventionText.value = data.sections.intervention || '';
                        if (responseText) responseText.value = data.sections.response || '';
                        if (birpPlanText) birpPlanText.value = data.sections.plan || '';
                        break;
                    case 'dap':
                        if (dataText) dataText.value = data.sections.data || '';
                        if (dapAssessmentText) dapAssessmentText.value = data.sections.assessment || '';
                        if (dapPlanText) dapPlanText.value = data.sections.plan || '';
                        break;
                    case 'basic':
                        if (presentationText) presentationText.value = data.sections.presentation || '';
                        if (stateText) stateText.value = data.sections.state || '';
                        if (basicAssessmentText) basicAssessmentText.value = data.sections.assessment || '';
                        if (basicPlanText) basicPlanText.value = data.sections.plan || '';
                        break;
                }

                showSuccess('Notes generated successfully!');
            } catch (error) {
                showError('Error generating notes: ' + error.message);
            } finally {
                generateNotesBtn.disabled = false;
                generateNotesBtn.innerHTML = '<i class="fas fa-magic mr-2"></i>Generate Notes';
            }
        });
    }

    if (saveNotesBtn) {
        saveNotesBtn.addEventListener('click', async () => {
            try {
                saveNotesBtn.disabled = true;
                saveNotesBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Saving...';

                // Collect notes data based on the selected template
                let notesData = {
                    template: templateSelect.value,
                    content: {}
                };

                switch (templateSelect.value) {
                    case 'soap':
                        notesData.content = {
                            subjective: subjectiveText.value,
                            objective: objectiveText.value,
                            assessment: assessmentText.value,
                            plan: planText.value
                        };
                        break;
                    case 'birp':
                        notesData.content = {
                            behavior: behaviorText.value,
                            intervention: interventionText.value,
                            response: responseText.value,
                            plan: birpPlanText.value
                        };
                        break;
                    case 'dap':
                        notesData.content = {
                            data: dataText.value,
                            assessment: dapAssessmentText.value,
                            plan: dapPlanText.value
                        };
                        break;
                    case 'basic':
                        notesData.content = {
                            presentation: presentationText.value,
                            state: stateText.value,
                            assessment: basicAssessmentText.value,
                            plan: basicPlanText.value
                        };
                        break;
                }

                const response = await fetch('/save_notes', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(notesData)
                });

                if (!response.ok) {
                    const data = await response.json();
                    throw new Error(data.error || 'Failed to save notes');
                }

                showSuccess('Notes saved successfully!');
            } catch (error) {
                showError('Error saving notes: ' + error.message);
            } finally {
                saveNotesBtn.disabled = false;
                saveNotesBtn.innerHTML = '<i class="fas fa-save mr-2"></i>Save Notes';
            }
        });
    }

    // Helper functions for showing success/error messages
    function showSuccess(message) {
        // You can implement this based on your UI design
        alert(message);
    }

    function showError(message) {
        // You can implement this based on your UI design
        alert(message);
    }

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
                        plan: basicPlanText.value
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
});
