# Google Cloud Migration & Architecture Roadmap

This document outlines how migrating GlobePulse to **Google Cloud (GCP)** and using **Cloud Firestore** forms a unified, secure, and highly scalable serverless ecosystem.

---

## 🏛️ Target Google Cloud Architecture

By moving GlobePulse to Google Cloud, we transition from local server files to a fully managed, serverless, scale-to-zero infrastructure:

```
                  +-----------------------------------+
                  |           User Browser            |
                  +-----------------+-----------------+
                                    |
                                    v (HTTPS)
                  +-----------------+-----------------+
                  |      Firebase Web Hosting /       | -> Static React SPA
                  |    Google Cloud Storage (CDN)     |
                  +-----------------+-----------------+
                                    |
                                    v (REST / WebSockets)
                  +-----------------+-----------------+
                  |      Google Cloud Run Container   | -> FastAPI Application
                  |   (Scale-to-Zero Serverless)      |    (Accesses Gemini API)
                  +--------+-----------------+--------+
                           |                 |
            (Read / Write) |                 | (IAM Roles - No Keys)
                           v                 v
                  +--------+--------+      +-+----------------+
                  |  Cloud Firestore|      |  Cloud Scheduler |
                  |   (NoSQL DB)    |      +--------+---------+
                  +--------+--------+               | (Hourly trigger)
                           ^                        v
                           |               +--------+---------+
                           +---------------+  Cloud Run Jobs  | -> Ingestion Scraper
                            (Batch Writes) |   (Scraper Task) |    Pipeline Script
                                           +------------------+
```

---

## 🔒 Security: Passwordless & Keyless Authentication (IAM)

One of the greatest benefits of using Firestore within Google Cloud is **Identity and Access Management (IAM)**:
*   **No Hardcoded Credentials**: In local development, we use a service account JSON file. In production on GCP (Cloud Run, Cloud Functions), the container uses **Application Default Credentials (ADC)**.
*   **Service Accounts**: We assign a dedicated service account to the Cloud Run backend with the role `roles/datastore.user` (Firestore Access) and `roles/aiplatform.user` (Gemini API Access). 
*   **Automatic Handshake**: Google Cloud automatically signs all API requests between Cloud Run, Firestore, and the Gemini API in the background. If a container is compromised, there are no database passwords or API keys stored in environment variables to steal.

---

## ⚙️ How the Scraper Pipeline Fits in GCP

Instead of running a persistent background Python loop or requiring a Databricks cluster to run 24/7 (which incurs high baseline idle costs), we can run the news ingestion scraper serverlessly:

1.  **Cloud Run Jobs / Cloud Functions**: Package [pipeline.py](file:///Users/pravintakpire/datascience/Competitions/Hackathons/Gemini_Hackathon/GlobePulse/backend/pipeline.py) as a containerized job or serverless function.
2.  **Cloud Scheduler**: Trigger the job once an hour using a cron trigger (e.g. `0 * * * *`).
3.  **Lifecycle**: 
    *   Cloud Scheduler wakes up the Cloud Run Job.
    *   The Scraper runs for 1–2 minutes, fetches Google News RSS, decrypts links, extracts body text, runs sentiment analysis via Gemini, and writes results to **Cloud Firestore**.
    *   The Job shuts down, scaling back to zero.
    *   **Cost**: You only pay for the exact execution time (seconds). Idle cost is **$0**.

---

## 📈 Scalability, Analytics & BigQuery Sync

As GlobePulse grows, Firestore easily connects with GCP’s data warehousing and BI tools:
*   **Real-time BigQuery Export**: Firebase offers an extension called *Export Collections to BigQuery*. Any new news articles or sentiments saved in Firestore are automatically streamed into **Google BigQuery** in real-time.
*   **Advanced Analytics**: You can write SQL queries over years of historical sentiment logs, connect the database to **Looker Studio** for executive reports, or train predictive models using **Vertex AI** without adding any query load to your transactional Firestore database.

---

## 💡 Summary of Why This fits GlobePulse

*   **Lowest Idle Cost**: Cloud Run, Firestore, and Cloud Functions scale to zero. If the dashboard has no active users, your Google Cloud bill is virtually **$0**.
*   **GCP Native Alignment**: Firestore is Google Cloud's premier serverless NoSQL database. Using it ensures seamless compatibility when deploying backend apps.
*   **Gemini API Proximity**: Since Gemini and Vertex AI are hosted in Google Cloud datacenters, communication between Cloud Run and Gemini is ultra-fast with low network latency.
