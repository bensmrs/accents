"""This module is the application entrypoint"""

import math
import tempfile
from pathlib import Path
from flask import Flask, render_template, jsonify, request, send_from_directory, abort
import parselmouth as pm

APP_ROOT = Path(__file__).parent.resolve()
SAMPLES_DIR = APP_ROOT / "samples"
app = Flask(__name__, static_folder="static", template_folder="templates")


def list_samples():
    """List all the audio samples"""
    SAMPLES_DIR.mkdir(parents=True, exist_ok=True)
    return sorted([p.name for p in SAMPLES_DIR.glob("*.wav")])

VOWELS = {
    "i":  (270, 2290, 3010),
    "ɪ":  (390, 1990, 2550),
    "e":  (530, 1840, 2480),
    "ɛ":  (610, 1720, 2410),
    "æ":  (860, 1660, 2380),
    "ɑ":  (730, 1090, 2440),
    "ɔ":  (570,  840, 2410),
    "o":  (500,  905, 2400),
    "ʊ":  (440, 1020, 2240),
    "u":  (300,  870, 2240),
    "ʌ":  (640, 1190, 2390),
    "ɝ":  (490, 1350, 1690),
    #"ə":  (500, 1500, 2100),
}

def distance(a, b, w):
    return math.sqrt(w[0]*(a[0]-b[0])**2 + w[1]*(a[1]-b[1])**2 + w[2]*(a[2]-b[2])**2)


def closest_vowel(f1, f2, f3, w=(1.0, 1.0, 0.3)):
    """Get the closest vowel"""
    best_v = None
    best_d = float("inf")
    for v, p in VOWELS.items():
        d = distance((f1, f2, f3), p, w)
        if d < best_d:
            best_v, best_d = v, d
    return best_v


def wrap_none(v):
    """Wrap a negative value as None"""
    return None if v <= 0 else v


def analyze(path, pitch_floor=75, pitch_ceiling=500, time_step=0.01):
    """Analyze the given file"""
    sound = pm.Sound(str(path))
    pitch = sound.to_pitch(time_step=time_step, pitch_floor=pitch_floor,
                           pitch_ceiling=pitch_ceiling)
    times = pitch.xs().tolist()
    p_vals = [wrap_none(p.frequency) for p in pitch.selected]
    intensity = sound.to_intensity(time_step=time_step)
    formants = sound.to_formant_burg(time_step=time_step)
    f_vals = []
    v_vals = []

    for (i, t) in enumerate(times):
        f0 = p_vals[i]
        if f0 is None:
            f_vals.append([])
            v_vals.append(None)
        else:
            f = []
            for j in range(3):
                formant = formants.get_value_at_time(j + 1, t)
                if math.isnan(formant):
                    f_vals.append([])
                    v_vals.append(None)
                    continue
                f.append(formant)
            f_vals.append(f)
            v_vals.append(closest_vowel(f[0], f[1], f[2]))

    return {
        'time': times,
        'pitch': p_vals,
        'formants': f_vals,
        'vowels': v_vals,
        'intensity': [wrap_none(db) for db in intensity.values[0]]
    }


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/api/samples")
def api_samples():
    return jsonify({"files": list_samples()})


@app.route("/samples/<path:filename>")
def serve_sample(filename):
    safe = Path(filename).name
    full = SAMPLES_DIR / safe
    if not full.exists() or full.suffix.lower() != ".wav":
        abort(404)
    return send_from_directory(str(SAMPLES_DIR), safe)


@app.route("/api/analyze", methods=["POST"])
def api_analyze():
    sample_name = request.form.get("sample")
    if not sample_name:
        return jsonify({"error": "missing sample"}), 400

    safe = Path(sample_name).name
    reference_path = SAMPLES_DIR / safe
    if not reference_path.exists():
        return jsonify({"error": "sample not found"}), 404

    result = {}
    try:
        result['reference'] = analyze(reference_path)
    except Exception as e:
        return (jsonify({'error': str(e)}), 500)

    if "recording" in request.files:
        f = request.files["recording"]
        with tempfile.NamedTemporaryFile(suffix='.wav', delete=True) as tmp:
            f.save(tmp)
            tmp.flush()
            try:
                result['user'] = analyze(Path(tmp.name))
            except Exception as e:
                return jsonify({"error": str(e)}), 500

    return jsonify(result)


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=8060, debug=True)
