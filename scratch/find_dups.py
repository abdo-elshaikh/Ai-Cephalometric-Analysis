import re
from collections import Counter

content = open('ai_service/engines/measurement_engine.py', encoding='utf-8').read()
codes = re.findall(r'\"code\": \"([^\"]+)\"', content)
counts = Counter(codes)
duplicates = [code for code, count in counts.items() if count > 1]
print(f"Duplicates: {duplicates}")
