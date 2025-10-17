// This module implements a simple raw audio recorder


class Recorder extends AudioWorkletProcessor {
    process(inputs, outputs, parameters) {
        if (inputs.length === 0)
            return true;
        const input = inputs[0];
        if (input.length === 0)
            return true;
        const channel = input[0];
        if (channel.length === 0)
            return true;
        const buffer = new Float32Array(channel.length);
        buffer.set(channel);
        this.port.postMessage(buffer, [buffer.buffer]);
        return true;
    }
}

registerProcessor('recorder', Recorder);
