import { encodeWAV } from '/static/wav.mjs';

export class App {
    #sampleSelect;
    #referenceAudio;
    #userAudio;
    #pitchSlider;
    #intensitySlider;
    #offsetSlider;
    #timeOffset;
    #offsetValue;
    #analysis;
    #pitchCanvas;
    #formantsCanvas;
    #intensityCanvas;
    #referencePlay;
    #userRecord;
    #userPlay;
    #audioCtx;
    #audioStream;
    #audioInput;
    #audioWorklet;
    #pcmBuffers;
    #mainSection;

    constructor() {
        this.#sampleSelect = document.getElementById('sample-select');
        this.#referenceAudio = document.getElementById('reference-audio');
        this.#userAudio = document.getElementById('user-audio');
        this.#offsetSlider = document.getElementById('offset-slider');
        this.#timeOffset = 0;
        this.#offsetValue = document.getElementById('offset-value');
        this.#offsetSlider.addEventListener('input', e => this.#setTimeOffset(e.target.value));
        this.#pitchSlider = document.getElementById('pitch-slider');
        this.#pitchSlider.addEventListener('input', this.#draw.bind(this));
        this.#intensitySlider = document.getElementById('intensity-slider');
        this.#intensitySlider.addEventListener('input', this.#draw.bind(this));
        this.#analysis = null;
        this.#pitchCanvas = document.getElementById('pitch-canvas');
        this.#formantsCanvas = document.getElementById('formants-canvas');
        this.#intensityCanvas = document.getElementById('intensity-canvas');
        this.#referencePlay = document.getElementById('reference-play');
        this.#referencePlay.addEventListener('click', () => this.#referenceAudio.play());
        this.#userRecord = document.getElementById('user-record');
        this.#userRecord.addEventListener('click', this.#record.bind(this));
        this.#userPlay = document.getElementById('user-play');
        this.#userPlay.addEventListener('click', () => this.#userAudio.play());
        this.#audioCtx = null;
        this.#sampleSelect.addEventListener('change', this.#updateReferenceSource.bind(this));
        this.#setTimeOffset(this.#offsetSlider.value);
        this.#audioStream = null;
        this.#mainSection = document.getElementById('main');
        window.addEventListener('resize', this.#draw.bind(this));
    }

    #updateReferenceSource() {
        this.#userPlay.disabled = true;
        this.#referenceAudio.src = `/samples/${encodeURIComponent(this.#sampleSelect.value)}`;
        this.#analyze();
    }

    #drawAxes(ctx, pad, w, h, yLabel) {
        ctx.strokeStyle = '#394055';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(pad.l, pad.t);
        ctx.lineTo(pad.l, pad.t + h);
        ctx.lineTo(pad.l + w, pad.t + h);
        ctx.stroke();
        ctx.fillStyle = '#9aa0a6';
        ctx.font = '12px system-ui';
        ctx.fillText(yLabel, 2, 14);
    }

    #drawLegend(ctx, pad, i, c, l) {
        ctx.stroke();
        ctx.fillStyle = '#cbd5e1';
        ctx.fillText(l, pad.l + 20 + 90 * i, pad.t + 12);
        ctx.fillStyle = c;
        ctx.fillRect(pad.l + 8 + 90 * i, pad.t + 4, 8, 8);
    }

    #drawAudio(ctx, pad, w, h, currentTime, tMin, tMax) {
        if (currentTime !== null && currentTime >= tMin && currentTime <= tMax) {
            const x = pad.l + ((currentTime - tMin) / (tMax - tMin)) * w;
            ctx.save();
            ctx.globalAlpha = 0.7;
            ctx.strokeStyle = '#e2e8f0';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(x, pad.t);
            ctx.lineTo(x, pad.t + h);
            ctx.stroke();
            ctx.restore();
        }
    }

    #drawSeries(canvas, series, yLabel, currentTime) {
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        const pad = { l: 30, r: 10, t: 20, b: 10 };
        const w = canvas.width - pad.l - pad.r;
        const h = canvas.height - pad.t - pad.b;

        const [times, values] = series.reduce(([t, v], s) => [t.concat(s.t), v.concat(s.v)], [[], []]);
        const tMin = Math.min(...times);
        const tMax = Math.max(...times);
        const vMin = Math.min(...values);
        const vMax = Math.max(...values);

        this.#drawAxes(ctx, pad, w, h, yLabel);

        for (const [i, { t, v, c, l }] of series.entries()) {
            ctx.strokeStyle = c;
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            let started = false;
            for (let i = 0; i < t.length; i++) {
                if (v[i] === null) {
                    started = false;
                    continue;
                }
                const x = pad.l + ((t[i] - tMin) / (tMax - tMin)) * w;
                const y = pad.t + h - ((v[i] - vMin) / (vMax - vMin)) * h;
                if (!started) {
                    ctx.moveTo(x,y);
                    started=true;
                }
                else {
                    ctx.lineTo(x,y);
                }
            }
            this.#drawLegend(ctx, pad, i, c, l);
        }

        this.#drawAudio(ctx, pad, w, h, currentTime, tMin, tMax);
    }

    #drawFormants(canvas, series, yLabel, currentTime) {
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        const pad = { l: 30, r: 10, t: 20, b: 10 };
        const w = canvas.width - pad.l - pad.r;
        const h = canvas.height - pad.t - pad.b;

        const [times, values] = series.reduce(([t, v], s) => [t.concat(s.t), v.concat(...s.v)], [[], []]);
        const tMin = Math.min(...times);
        const tMax = Math.max(...times);
        const vMin = Math.min(...values);
        const vMax = Math.max(...values);

        this.#drawAxes(ctx, pad, w, h, yLabel);

        const xScale = (t) => pad.l + ((t - tMin) / (tMax - tMin)) * w;
        const yScale = (v) => pad.t + h - ((v - vMin) / (vMax - vMin)) * h;

        ctx.strokeStyle = '#fff';
        for (const [i, { t, v, c, l }] of series.entries()) {
            ctx.globalAlpha = .7;
            ctx.fillStyle = c;
            let f2 = [];
            let f3 = [];
            ctx.beginPath();
            for (let i = 0; i < t.length + 1; i++) {
                if (i === t.length || v[i].length !== 3) {
                    for (const {t, v} of f3.toReversed())
                        ctx.lineTo(xScale(t), yScale(v));
                    ctx.closePath();
                    ctx.fill();
                    ctx.stroke();
                    ctx.beginPath();
                    for (const {t, v} of f2)
                        ctx.lineTo(xScale(t), yScale(v));
                    ctx.stroke();
                    ctx.closePath();
                    ctx.beginPath();
                    f2 = [];
                    f3 = [];
                    continue;
                }
                ctx.lineTo(xScale(t[i]), yScale(v[i][0]))
                f2.push({t: t[i], v: v[i][1]});
                f3.push({t: t[i], v: v[i][2]});
            }
            ctx.globalAlpha = 1;
            this.#drawLegend(ctx, pad, i, c, l);
        }

        this.#drawAudio(ctx, pad, w, h, currentTime, tMin, tMax);
    }

    #record() {
        if (this.#audioStream === null)
            this.#startRecording();
        else
            this.#stopRecording();
    }

    #startRecording() {
        let initWorklet;
        if (this.#audioCtx === null) {
            this.#audioCtx = new AudioContext();
            initWorklet = this.#audioCtx.audioWorklet.addModule('/static/recorder.mjs');
        }
        else {
            initWorklet = this.#audioCtx.resume();
        }
        initWorklet.then(() => navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1 } }).then(stream => {
            this.#userRecord.className = "stop";
            this.#audioStream = stream;
            this.#audioInput = this.#audioCtx.createMediaStreamSource(stream);
            this.#audioWorklet = new AudioWorkletNode(this.#audioCtx, 'recorder', { numberOfOutputs: 0 });
            this.#pcmBuffers = [];
            this.#audioWorklet.port.addEventListener('message', e => {
                this.#pcmBuffers.push(new Float32Array(e.data));
            });
            this.#audioWorklet.port.start();
            this.#audioInput.connect(this.#audioWorklet);
        }));
    }

    #stopRecording() {
        this.#audioInput.disconnect();
        this.#audioWorklet.port.close();
        this.#audioWorklet.disconnect();
        this.#audioStream.getTracks().forEach(t => t.stop());
        this.#audioStream = null;
        this.#audioCtx.suspend();
        const blob = encodeWAV(this.#pcmBuffers, this.#audioCtx.sampleRate);
        this.#analyze(blob);
        this.#userAudio.src = URL.createObjectURL(blob);
        this.#userRecord.className = "record";
        this.#userPlay.disabled = false;
    }

    #slideMul(value, slider) {
        if (value === null)
            return null;
        return value * (parseFloat(slider.value) || 1);
    }

    #slideAdd(value, slider) {
        if (value === null)
            return null;
        return value + (parseFloat(slider.value) || 0);
    }

    #draw() {
        if (this.#analysis === null)
            return;
        const { width, height } = this.#mainSection.getBoundingClientRect();
        this.#pitchCanvas.width = width - 78;
        this.#formantsCanvas.width = width - 58;
        this.#intensityCanvas.width = width - 78;
        let currentTime = null;
        if (!this.#referenceAudio.paused) {
            currentTime = this.#referenceAudio.currentTime;
        }
        else if (!this.#userAudio.paused) {
            currentTime = this.#userAudio.currentTime + this.#timeOffset;
        }

        const pitch = [];
        const formants = [];
        const intensity = [];

        if ('reference' in this.#analysis) {
            const t = this.#analysis.reference.time;
            const c = '#7aa2ff';
            const l = 'Reference'
            pitch.push({ t, v: this.#analysis.reference.pitch, c, l });
            formants.push({ t, v: this.#analysis.reference.formants, c, l });
            intensity.push({ t, v: this.#analysis.reference.intensity, c, l });
        }

        if ('user' in this.#analysis) {
            const t = this.#analysis.user.time.map(t => t + this.#timeOffset);
            const c = '#ff7a7a';
            const l = 'Student'
            pitch.push({ t, v: this.#analysis.user.pitch.map(p => this.#slideMul(p, this.#pitchSlider)), c, l });
            formants.push({ t, v: this.#analysis.user.formants, c, l });
            intensity.push({ t, v: this.#analysis.user.intensity.map(i => this.#slideAdd(i, this.#intensitySlider)), c, l });
        }

        this.#drawSeries(this.#pitchCanvas, pitch, 'Relative frequency (Hz)', currentTime);
        this.#drawFormants(this.#formantsCanvas, formants, 'Relative frequency (Hz)', currentTime);
        this.#drawSeries(this.#intensityCanvas, intensity, 'Relative sound level (dB)', currentTime);
    }

    #analyze(blob = null) {
        const fd = new FormData();
        fd.append('sample', this.#sampleSelect.value);
        if (blob !== null)
            fd.append('recording', blob);
        this.#sampleSelect.disabled = true;
        this.#userRecord.disabled = true;
        fetch('/api/analyze', { method: 'POST', body: fd }).then(r => r.json().then(data => {
            if (!r.ok) {
                alert(data.error || 'Error');
                this.#analysis = null;
            }
            else {
                this.#analysis = data;
            }
            this.#draw();
            this.#sampleSelect.disabled = false;
            this.#userRecord.disabled = false;
        }));
    }

    #setTimeOffset(v) {
        this.#timeOffset = parseFloat(v) || 0;
        this.#offsetValue.value = `${this.#timeOffset.toFixed(2)} s`;
        this.#draw();
    }

    #tick() {
        if (!this.#referenceAudio.paused || !this.#userAudio.paused) {
            this.#draw();
            requestAnimationFrame(this.#tick.bind(this));
        }
        else {
            setTimeout(() => requestAnimationFrame(this.#tick.bind(this)), 200);
        }
    }

    init() {
        fetch('/api/samples').then(r => r.json().then(data => {
            data.files.forEach(name => {
                const option = document.createElement('option');
                option.value = name;
                option.textContent = name;
                this.#sampleSelect.appendChild(option);
            });
            this.#updateReferenceSource();
        }));
        this.#tick();
    }
}
