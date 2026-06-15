# Migration Plan: Databricks to Google Cloud Platform (GCP)

This document outlines the proposal and implementation details for migrating the GlobePulse ingestion pipeline, storage layer, and online retrieval/inference engine from Databricks to Google Cloud and Google AI products.

---

## 1. Component Mapping & Architecture

| Databricks Component / Local Store | Google Cloud / Google AI Equivalent | Rationale & Benefits |
| :--- | :--- | :--- |
| **Databricks SQL / Delta Lake** (users, articles, chunks) | **Google BigQuery** | Serverless, SQL-compatible data warehouse. Simplifies data management and eliminates dedicated cluster hosting costs. |
| **Databricks Notebooks** (pipeline orchestrator) | **Vertex AI Workbench (Colab Enterprise)** / **Google Cloud Run** | Easy migration of `.ipynb` files. Scheduled Cloud Run jobs (using Cloud Scheduler) provide serverless pipeline execution. |
| **ChatDatabricks (dbrx-instruct)** (Sentiment Extraction / Summarization) | **Vertex AI Gemini 1.5 Flash / 2.5 Flash** | Significantly faster and more cost-effective. Supports structured JSON outputs natively. |
| **Databricks Vector Search** | **BigQuery Vector Search** | Indexes and queries embeddings natively within BigQuery using standard SQL (via `VECTOR_SEARCH`). No separate vector database required. |
| **databricks-bge-large-en** (Embeddings) | **Vertex AI Text Embeddings (`text-embedding-004`)** | High-performance embedding model fully integrated with the Vertex AI ecosystem. |
| **Local File (`users.json`) / SQLite** (User Credentials & Profiles) | **Google Cloud Identity Platform** + **Cloud Firestore** | **Identity Platform** provides enterprise-grade, secure authentication (Gmail SSO, phone/email login), while **Firestore** (serverless NoSQL database) stores user metadata and watchlists with real-time sync. |

---

## 2. Proposed Changes

### Ingestion & Enrichment Pipeline (Offline)

* **Scraping & Storage (`01. Scrape, Clean & Load Articles`):**
  * Replace Spark SQL write queries with BigQuery client library queries (`google-cloud-bigquery`).
  * Initialize tables: `hackathon_schema.users` and `hackathon_schema.articles`.

* **Structured Sentiment Analysis (`02. Extract & Analyze Sentiment`):**
  * Replace Databricks DBRX model invocation with Vertex AI/Gemini API calls.
  * Utilize Pydantic models with Gemini's **Structured Outputs** (`response_mime_type="application/json"` with schema parameters) to enforce topic sentiment outputs reliably.
  * Write the JSON response back to the `sentiment` column of the BigQuery articles table.

* **Vector Search & Chunking (`03. RAG`):**
  * Replace RecursiveCharacterTextSplitter and Databricks vector index sync.
  * Split documents, generate embeddings via `text-embedding-004`, and store the chunks in a BigQuery table.
  * Build a native vector index on the embedding column in BigQuery using `CREATE VECTOR INDEX`.
  * Retrieve context directly via SQL using:
    ```sql
    SELECT query.content, distance
    FROM VECTOR_SEARCH(
      TABLE my_dataset.source_table, 'embedding',
      (SELECT ml_generate_embedding_result FROM ML.GENERATE_EMBEDDING(...))
    )
    ```

---

### Dashboard Application (Online App)

* **`functions.py` & `app.py`:**
  * Replace the commented Databricks Spark connectors with the `google-cloud-bigquery` Python client helper.
  * Update credentials helper to look for Google Application Default Credentials (ADC) or a local service account key/API key via Streamlit secrets (`secrets.toml`).
  * (Optional) Update `embedchain` config to use `google` provider instead of `openai`.

* **User Authentication & Profiles:**
  * Replace the passwordless `users.json` local flat-file storage with **Google Cloud Identity Platform** for user sign-in and authorization (allowing Gmail/Google SSO and phone verification).
  * Store user profile details (first name, last name, phone, watchlist) inside **Google Cloud Firestore**, securing access using Firestore Security Rules.

---

## 3. Next Steps & Prerequisites

1. **GCP Setup:** Enable the BigQuery API, Vertex AI API, Cloud Identity Platform API, and Firestore API.
2. **Package Updates:** Add `google-cloud-bigquery`, `google-generativeai`, and `google-cloud-firestore` to `requirements.txt`.
3. **Execution:** Update the notebook scripts and app backend helpers once ready to transition.
