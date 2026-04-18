from google import genai
import os

api_key = "AIzaSyCdOC4p86txuz1aMN9IoTW1cOxqw1Oa2OI"
client = genai.Client(api_key=api_key)

models_to_try = [
    "gemini-2.0-flash",
    "gemini-1.5-flash",
    "gemini-1.5-flash-latest",
    "gemini-flash-latest",
    "gemini-2.0-flash-exp"
]

print("--- Testing Models ---")
for model_name in models_to_try:
    try:
        print(f"Trying {model_name}...")
        response = client.models.generate_content(
            model=model_name,
            contents="Say hello"
        )
        print(f"Success with {model_name}: {response.text.strip()}")
        break
    except Exception as e:
        print(f"Failed {model_name}: {e}")
print("--- End Testing ---")
