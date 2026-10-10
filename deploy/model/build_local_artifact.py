"""Build a stand-in model artifact when the team's trained file is not at hand.

The trained artifact (models/delhi_pm10_calibrated.joblib) is not in git. This script makes a
replacement with the model repository's own code and nothing else: its simulated-data generator
(src/generate_stress_data.py with configs/stress_test.yaml), its training settings
(configs/train_config.yaml), and its train and calibrate steps. The result is a real
RandomForestRegressor served by the unchanged FastAPI service.

It is NOT the team's artifact. It is fitted to different simulated data, so its margin and its
verdicts differ, and the metrics in the model repository's README do not describe it. The
artifact says so itself: /model/info reports data_source "SYNTHETIC_SIMULATION_LOCAL_REBUILD".

Run from the model repository, with its pinned dependencies (the model image has them):

    python /path/to/build_local_artifact.py --out models/local-demo

Then serve it with AQI_CONFIG_PATH=models/local-demo/config.yaml.
"""
import argparse
import hashlib
import json
from pathlib import Path

import joblib
import yaml

from src.calibrate import calibrate_artifact
from src.config import load_config
from src.generate_stress_data import generate_observations
from src.predict import PredictionEngine, load_trusted_bundle
from src.train import chronological_split, train

DATA_SOURCE = 'SYNTHETIC_SIMULATION_LOCAL_REBUILD'
HIDDEN = ['synthetic_normal_difference', 'synthetic_incident_increment']


def build(out: Path) -> dict:
    out.mkdir(parents=True, exist_ok=True)
    artifact = out / 'local_demo_rf_calibrated.joblib'
    if artifact.exists():
        raise SystemExit(f'{artifact} already exists. Remove the directory to rebuild.')

    recipe = yaml.safe_load(Path('configs/stress_test.yaml').read_text(encoding='utf-8'))
    frame = generate_observations(recipe).drop(columns=HIDDEN)
    data = out / 'training.csv'
    frame.to_csv(data, index=False)

    config = load_config('configs/train_config.yaml')
    config.data.processed_path = str(data)
    config.artifacts.path = str(out / 'uncalibrated.joblib')
    parts = chronological_split(frame, config.data.timestamp_column, config.training.fractions)
    metadata = train(config)

    bundle = load_trusted_bundle(config)
    bundle['metadata'].update(
        data_source=DATA_SOURCE, synthetic_only=True,
        local_rebuild={
            'note': 'Stand-in fitted to regenerated simulated data. Not the team artifact delhi_pm10_calibrated.joblib.',
            'generator': 'src/generate_stress_data.py', 'recipe': 'configs/stress_test.yaml',
            'training_sha256': hashlib.sha256(data.read_bytes()).hexdigest(),
        })
    joblib.dump(bundle, config.artifacts.path)

    calibration_csv = out / 'calibration.csv'
    parts['calibration'].to_csv(calibration_csv, index=False)
    calibration = calibrate_artifact(config, calibration_csv, artifact)

    # The serving configuration sits next to the artifact, so the read-only mount carries both.
    config.artifacts.path = str(artifact)
    serving = out / 'config.yaml'
    serving.write_text(yaml.safe_dump(config.model_dump(), sort_keys=False), encoding='utf-8')
    engine = PredictionEngine(load_config(serving))
    if not engine.ready:
        raise SystemExit(f'The rebuilt artifact does not load: {engine.reason}')
    for scratch in (data, calibration_csv, out / 'uncalibrated.joblib'):
        scratch.unlink()
    return {'artifact': str(artifact), 'serving_config': str(serving), 'data_source': DATA_SOURCE,
            'calibrated_margin': calibration['margin'], 'validation': metadata['validation_metrics'],
            'fit_baseline_rows': metadata['fit_baseline_rows']}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--out', default='models/local-demo', help='directory for the artifact and its serving config')
    print(json.dumps(build(Path(parser.parse_args().out)), indent=2))
