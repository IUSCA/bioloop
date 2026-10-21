"""Tiny physical fixtures, independent of institutional filesystems and DB dumps."""
from pathlib import Path

root = Path('/opt/sca/data')
for source in ('genomics_lab_instrument_drop', 'proteomics_lab_instrument_drop'):
    sample = root / 'imports' / source / 'preview-sample'
    sample.mkdir(parents=True, exist_ok=True)
    (sample / 'hello.txt').write_text('BioLoop synthetic preview dataset\n', encoding='utf-8')
downloads = root / 'downloads'
downloads.mkdir(parents=True, exist_ok=True)
(downloads / 'preview-hello.txt').write_text('BioLoop synthetic preview download\n', encoding='utf-8')
