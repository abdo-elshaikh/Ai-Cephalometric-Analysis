from google import genai
import os

api_key = "AIzaSyCdOC4p86txuz1aMN9IoTW1cOxqw1Oa2OI"
client = genai.Client(api_key=api_key)

print("--- Start Listing ---")
try:
    models = list(client.models.list())
    if not models:
        print("No models found.")
    for m in models:
        print(f"{m.name} | {m.supported_generation_methods}")
except Exception as e:
    print(f"Error listing models: {e}")
print("--- End Listing ---")
