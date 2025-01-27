importScripts('/static/js/lame.min.js');

self.onmessage = function(e) {
    if (e.data.command === 'encode') {
        // Initialize encoder
        const mp3encoder = new lamejs.Mp3Encoder(1, 44100, 128);
        const samples = e.data.buffers;
        
        // Convert to 16-bit PCM
        const sampleLength = samples.length;
        const pcm = new Int16Array(sampleLength);
        for (let i = 0; i < sampleLength; i++) {
            pcm[i] = samples[i] * 0x7FFF;
        }
        
        // Encode to MP3
        const mp3Data = [];
        const blockSize = 1152; // Must be a multiple of 576
        
        for (let i = 0; i < pcm.length; i += blockSize) {
            const sampleBlock = pcm.subarray(i, i + blockSize);
            const mp3buf = mp3encoder.encodeBuffer(sampleBlock);
            if (mp3buf.length > 0) {
                mp3Data.push(mp3buf);
            }
        }
        
        // Get the last chunk of encoded data
        const mp3buf = mp3encoder.flush();
        if (mp3buf.length > 0) {
            mp3Data.push(mp3buf);
        }
        
        // Send the encoded MP3 data back
        self.postMessage({
            type: 'done',
            buffer: mp3Data
        });
    }
};
