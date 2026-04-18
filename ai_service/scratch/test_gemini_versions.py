from google import genai
import os

api_key = "AIzaSyCdOC4p86txuz1aMN9IoTW1cOxqw1Oa2OI"

print("--- Testing gemini-1.5-flash on v1 ---")
client_v1 = genai.Client(api_key=api_key, http_options={'api_version': 'v1'})
try:
    res = client_v1.models.generate_content(model='gemini-1.5-flash', contents='Hi')
    print(f"v1 Success: {res.text}")
except Exception as e:
    print(f"v1 Failure: {e}")

print("\n--- Testing gemini-1.5-flash on v1beta ---")
client_beta = genai.Client(api_key=api_key, http_options={'api_version': 'v1beta'})
try:
    res = client_beta.models.generate_content(model='gemini-1.5-flash', contents='Hi')
    print(f"v1beta Success: {res.text}")
except Exception as e:
    print(f"v1beta Failure: {e}")
