# CLASS_FREEZE — classification v3.2

Date: 2026-11-23

Rules change only if human review shows a block below **15/20** (or **8/10** for smaller blocks).

## SHA-256

- `config/yt_classes_v32.yaml`: `98c885aaaf799ec66e2b1b6fecf7e54782ae2aeec468223193815b792a90848c`
- `scripts/classify_yt_classes_v32.py`: `07a08a5278efa04fd1574cc5be7d5dccc67cf5db7055bc604a12ca4b94956d7f`

## Counts — strict

Classes: `{'other': 193894, 'asmr_labelled': 148569, 'noise_not_asmr': 16362, 'ambient_labelled_asmr': 9201}`

asmr_labelled tiers: `{'A': 91070, 'B': 53795, 'C': 3704}`

## Counts — title_only

Classes: `{'other': 198183, 'asmr_labelled': 151626, 'noise_not_asmr': 12073, 'ambient_labelled_asmr': 6144}`

asmr_labelled tiers: `{'A': 91070, 'B': 54714, 'C': 5842}`

Frame size (title_only asmr_labelled ∧ ¬long_B): **149,218**
