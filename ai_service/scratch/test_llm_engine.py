import sys
sys.path.insert(0, '.')
from utils.norms_util import norms_provider
norms_provider.load('config/analysis_norms.json')

measurements = {'SNA': 85.0, 'SNB': 80.0, 'ANB': 5.0, 'FMA': 31.0, 'FMIA': 64.0}

from engines.llm_engine import _build_deviation_table, _extract_json

# Test deviation table
table = _build_deviation_table(measurements)
print('=== Deviation Table ===')
print(table)

# Test JSON extraction
print()
print('=== JSON Extraction ===')
cases = [
    ('dict', '{"treatments": [{"plan_index": 0}]}'),
    ('list', '[{"plan_index": 0}]'),
    ('markdown', '```json\n{"treatments": []}\n```'),
]
for label, raw in cases:
    try:
        result = _extract_json(raw)
        print(f'  {label}: OK -> {type(result).__name__}')
    except ValueError as e:
        print(f'  {label}: FAIL -> {e}')

print()
print('All tests complete.')
