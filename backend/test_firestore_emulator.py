import os
import sys

# Ensure parent directory is in sys.path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

import database

def test_emulator():
    print("Testing connection to Firestore Emulator...")
    print(f"FIRESTORE_EMULATOR_HOST = {os.environ.get('FIRESTORE_EMULATOR_HOST')}")

    if database.db is None:
        print("❌ Error: Firestore client is None. Make sure dependencies are installed.")
        sys.exit(1)

    try:
        # 1. Test Writing to 'users' collection
        print("\nWriting test user document...")
        user_ref = database.db.collection("users").document("test_emulator@marketwave.com")
        user_ref.set({
            "first_name": "Emulator",
            "last_name": "Tester",
            "email": "test_emulator@marketwave.com",
            "watchlist": "Tesla,Apple,Google"
        })
        print("✅ Document written successfully.")

        # 2. Test Reading from 'users' collection
        print("\nReading test user document...")
        doc = user_ref.get()
        if doc.exists:
            print(f"✅ Success! Read user data: {doc.to_dict()}")
        else:
            print("❌ Error: Document not found after set()!")
            sys.exit(1)

        # 3. Test Ingestion writing to 'articles' collection
        print("\nWriting test article document...")
        article_ref = database.db.collection("articles").document("test_article_doc_id")
        article_ref.set({
            "url": "https://example.com/test",
            "company_name": "Tesla",
            "content": "Tesla stock surged 5% today following record delivery numbers.",
            "date": "07/06/2026",
            "sentiment": {
                "layoffs": None,
                "revenue_growth": 0.5,
                "overall_sentiment": 0.6
            }
        })
        print("✅ Article written successfully.")

        # 4. Test Query Stream (similar to main.py queries)
        print("\nQuerying articles by company_name...")
        docs = database.db.collection("articles").where("company_name", "in", ["Tesla", "Apple"]).stream()
        results = []
        for doc in docs:
            results.append(doc.to_dict())
        
        print(f"✅ Query complete. Found {len(results)} articles.")
        for res in results:
            print(f" - {res.get('url')} | {res.get('company_name')} | Sentiment: {res.get('sentiment')}")

        # 5. Clean up test documents
        print("\nCleaning up test documents...")
        user_ref.delete()
        article_ref.delete()
        print("✅ Cleanup complete.")
        print("\n🎉 Verification Successful! The local Firestore Emulator is fully integrated and ready to use.")

    except Exception as e:
        print(f"\n❌ Verification Failed: {e}")
        print("Make sure the Firestore Emulator is running in the background. Start it using:")
        print("  npx -y firebase-tools@latest emulators:start --only firestore")
        sys.exit(1)

if __name__ == "__main__":
    test_emulator()
