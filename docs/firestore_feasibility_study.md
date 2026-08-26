# Feasibility Study: Cloud Firestore as MarketWave Backend Datastore

This document outlines the feasibility, architecture design, and benefits of migrating the MarketWave data layer from local files (`users.json`, `articles.csv`, and `db/alerts.json`) to **Cloud Firestore**.

---

## 🏁 Feasibility Verdict: **Highly Feasible & Recommended**

Migrating to Cloud Firestore is not only fully feasible, but it also represents a **critical production-grade upgrade** for MarketWave. The current file-based database (`articles.csv`) will degrade in performance as more news is scraped, since pandas must load the entire file into memory on every API call. Firestore resolves this by offering indexed, scalable, and concurrent queries.

---

## 🗺️ Firestore Data Model Design

We can map our current JSON/CSV structures to three Firestore collections:

### 1. `users` Collection
*   **Document ID**: User's `email` (e.g. `test@example.com`)
*   **Fields**:
    *   `first_name`: `string`
    *   `last_name`: `string`
    *   `phone`: `string`
    *   `password_hash`: `string` (SHA-256)
    *   `watchlist`: `array of strings` (e.g. `["Tesla", "Apple", "Google"]`) — *much cleaner than comma-separated strings.*

### 2. `articles` Collection
*   **Document ID**: Auto-generated ID, or a hash of the URL to prevent duplicates.
*   **Fields**:
    *   `url`: `string` (indexed for deduplication checks)
    *   `content`: `string` (truncated article body)
    *   `company_name`: `string` (indexed for stock queries)
    *   `date`: `string` or `timestamp` (indexed for daily history)
    *   `sentiment`: `map` (nested JSON structure containing the 18 topic scores) — *no more python `eval()` or `json.dumps()` overhead.*

### 3. `alerts` Collection
*   **Document ID**: Auto-generated ID.
*   **Fields**:
    *   `ticker`: `string`
    *   `average_sentiment`: `number` (float)
    *   `message`: `string`
    *   `timestamp`: `timestamp` (useful for setting TTL or ordering)

---

## ⚡ Query Mapping Comparison

Here is how our main operations compare between the current implementation and Firestore:

| Operation | Current File-based Code | Proposed Firestore (Python SDK) |
| :--- | :--- | :--- |
| **User Login check** | Reads entire `users.json`, checks dict keys. | `db.collection("users").document(email).get()` |
| **Update Watchlist** | Updates dict, rewrites entire `users.json`. | `db.collection("users").document(email).update({"watchlist": tickers})` |
| **Pipeline Deduplication** | Reads entire `articles.csv` into a `set` in memory. | `db.collection("articles").where("url", "==", url).limit(1).get()` |
| **Fetch Ticker Sentiments** | Loads `articles.csv` with pandas, filters rows. | `db.collection("articles").where("company_name", "in", watchlist).stream()` |
| **Historical Daily Trends** | Reads CSV, groups by date, averages scores. | `db.collection("articles").where("company_name", "==", ticker).order_by("date").stream()` |

---

## ⚖️ Pros and Cons Analysis

### ✅ Advantages
1.  **Concurrent Writes**: Multiple users can register, sign in, or update watchlists simultaneously without file-locking issues.
2.  **Indexing & Performance**: Reading a single user or filtering articles by ticker is an $O(1)$ indexed lookup.
3.  **Real-Time Capabilities**: Firestore supports listener subscriptions out-of-the-box, allowing the UI to receive real-time dashboard updates when new news is scraped.
4.  **Native Nested Map Support**: Stores the 18-topic sentiment scores as native maps rather than JSON strings, removing parsing steps.

### ⚠️ Challenges & Mitigation
1.  **Setup Credentials**: Requires a Service Account key (`google-credentials.json`) or setting the `GOOGLE_APPLICATION_CREDENTIALS` environment variable locally.
2.  **API Rate Limits / Quotas**: Standard limits are extremely generous (50k free reads / 20k free writes daily). For a hackathon/demo, this is completely free.
3.  **Composite Index Requirement**: Querying articles by `company_name` AND ordering by `date` will require creating a single composite index in the Firebase console. (Firestore provides a link to auto-create this index on first run).

---

## 🛠️ Step-by-Step Migration Plan

If we proceed with Firestore integration, the tasks will be:

1.  **Backend Dependency Update**: Add `google-cloud-firestore` to [backend/requirements.txt](file:///Users/mathamatigician/datascience/Competitions/Hackathons/Gemini_Hackathon/MarketWave/backend/requirements.txt).
2.  **Initialize Database Client**: Define the Firestore client helper in [backend/database.py](file:///Users/mathamatigician/datascience/Competitions/Hackathons/Gemini_Hackathon/MarketWave/backend/database.py):
    ```python
    from google.cloud import firestore
    db = firestore.Client()
    ```
3.  **Refactor database.py Operations**: Replace the local JSON reads/writes with Firestore document calls.
4.  **Refactor pipeline.py Ingestion**: Replace `df.to_csv()` with batch writes/document additions in Firestore.
5.  **Refactor main.py APIs**: Replace pandas filtering with Firestore query streams.
