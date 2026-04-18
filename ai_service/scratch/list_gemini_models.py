from google import genai
import os
from dotenv import load_dotenv

load_dotenv()

api_key = os.getenv("GEMINI_API_KEY")
if not api_key:
    # Try the one in the settings viewed earlier
    api_key = "AIzaSyCdOC4p86txuz1aMN9IoTW1cOxqw1Oa2OI"

client = genai.Client(api_key=api_key)

print("--- Listing Models ---")
for m in client.models.list():
    print(f"Name: {m.name}, Supported Methods: {m.supported_generation_methods}")
