import asyncio
import os
import sys

# Ensure we can import from the parent directory
sys.path.append(os.path.join(os.getcwd(), 'ai_service'))

from engines.llm_engine import generate_clinical_diagnosis_summary

async def test_gemini():
    print("--- Testing Gemini Fallback ---")
    mock_measurements = {"SNA": 82.0, "SNB": 80.0, "ANB": 2.0}
    
    # This will trigger Gemini if OpenAI key is invalid or quota is exceeded
    summary = await generate_clinical_diagnosis_summary(
        skeletal_class="ClassI",
        vertical_pattern="Normal",
        measurements=mock_measurements
    )
    
    if summary:
        print("\n[SUCCESS] Generated Summary:")
        print(summary)
    else:
        print("\n[FAILURE] No summary generated.")

if __name__ == "__main__":
    asyncio.run(test_gemini())
