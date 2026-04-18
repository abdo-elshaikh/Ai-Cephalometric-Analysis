from google import genai
import os

api_key = "AIzaSyCdOC4p86txuz1aMN9IoTW1cOxqw1Oa2OI"
client = genai.Client(api_key=api_key)

print("--- Start Listing ---")
try:
    for m in client.models.list():
        print(f"Name: {m.name}")
except Exception as e:
    print(f"Error listing models: {e}")
print("--- End Listing ---")
