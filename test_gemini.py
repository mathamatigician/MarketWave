import os
import sys

def test_key():
    GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY")

    secrets_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".streamlit", "secrets.toml")
    if os.path.exists(secrets_path):
        try:
            import tomllib
            with open(secrets_path, "rb") as f:
                secrets = tomllib.load(f)
            if not GEMINI_API_KEY:
                GEMINI_API_KEY = secrets.get("gemini_credentials", {}).get("API_KEY") or secrets.get("gemini", {}).get("api_key")
        except Exception as e:
            print(f"Warning: Could not read secrets from secrets.toml: {e}")

    if not GEMINI_API_KEY or GEMINI_API_KEY == "YOUR_GEMINI_API_KEY_HERE":
        print("\n❌ Error: No Gemini API key detected! Please add your key to `.streamlit/secrets.toml` or set GEMINI_API_KEY in your environment.")
        return

    try:
        import google.generativeai as genai
        genai.configure(api_key=GEMINI_API_KEY)
        
        print("\nListing all models available for your API key:")
        found_models = []
        for m in genai.list_models():
            if 'generateContent' in m.supported_generation_methods:
                print(f" - {m.name}")
                found_models.append(m.name)
        
        if not found_models:
            print("⚠️ No content-generation models found in list.")
            return

        # Attempt to use the first available model or standard gemini-1.5-flash if listed
        target_model = "gemini-1.5-flash"
        if f"models/{target_model}" not in found_models and f"{target_model}" not in found_models:
            # Pick first available as target
            target_model = found_models[0].replace("models/", "")
            print(f"\nModel 'gemini-1.5-flash' not found. Using available model: '{target_model}'")
        else:
            print(f"\nModel 'gemini-1.5-flash' is listed. Testing generation with it...")

        model = genai.GenerativeModel(target_model)
        response = model.generate_content("Respond with exactly: 'Gemini API key is working!'")
        
        output = response.text.strip()
        print(f"\n✨ Response from Gemini ({target_model}): \"{output}\"")
        if "is working" in output.lower():
            print("\n✅ Verification Successful! Your Gemini API key is working perfectly.")
    except Exception as e:
        print(f"\n❌ API Call Failed: {e}")

if __name__ == "__main__":
    test_key()
