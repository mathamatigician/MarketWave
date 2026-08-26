# MarketWave Sentiment Score Calculation & Aggregation Details

This document explains how MarketWave extracts sentiment scores from news articles and aggregates them for dashboard tables, heatmaps, and charts.

---

## 📊 Overview of the Ingestion & Calculation Flow

```
                      +-----------------------------+
                      |     Raw Article Content     |
                      +--------------+--------------+
                                     |
                                     v
                      +--------------+--------------+
                      | 1. Score Extraction (LLM)  | -> Uses gemini-2.5-flash with response_schema
                      +-------+--------------+------+
                              |              |
           +------------------+              +------------------+
           | (Dashboard Overview)                               | (Time-Series Charts)
           v                                                    v
+----------+------------------+                      +----------+------------------+
| 2. Overall Aggregation      |                      | 3. Daily Aggregation        |
| - Filters out nulls         |                      | - Groups by Date            |
| - Computes MEDIAN score     |                      | - Computes MEAN score       |
| - Tracks mention count (N)  |                      | - Returns wide format DF    |
+-----------------------------+                      +-----------------------------+
```

---

## 🔍 Detailed Sentiment Stages

### 1. Sentiment Score Extraction (Per Article)
*   **Source Logic:** `analyze_sentiment_gemini()` in [pipeline.py](file:///Users/pravintakpire/datascience/Competitions/Hackathons/Gemini_Hackathon/MarketWave/pipeline.py)
*   **LLM Model:** Google Gemini `gemini-2.5-flash` (or fallback to OpenAI `gpt-4o-mini` if configured, or neutral default if no keys are found).
*   **Structured Outputs:** Uses structured generation by enforcing a Pydantic schema: `TopicSentimentSchema` (18 topics).
*   **Value Scale:**
    *   **`-1.0`**: Highly negative (e.g. major layoffs, disputes, or revenue contraction).
    *   **`1.0`**: Highly positive (e.g. record revenue growth, successful product launches).
    *   **`0.0`**: Neutral.
    *   **`null`**: The topic was not mentioned in the article text.
*   **Output Structure:**
    ```json
    {
      "layoffs": null,
      "restructuring": -0.4,
      "board_changes": null,
      "mergers": null,
      "investor_activity": 0.8,
      "esg": null,
      "revenue_growth": 0.9,
      "product_launches": null,
      "expansion": 0.5,
      "disputes": null,
      "geo_political": null,
      "macro_economic": null,
      "partnerships": null,
      "cyber_security": null,
      "supply_chain": null,
      "labor_issues": null,
      "product_recalls": null,
      "overall_sentiment": 0.6
    }
    ```

---

### 2. Cross-Article Aggregation (Overall Metrics)
*   **Source Logic:** `aggregate_sentiment(sentiments)` in [functions.py](file:///Users/pravintakpire/datascience/Competitions/Hackathons/Gemini_Hackathon/MarketWave/functions.py)
*   **Purpose:** Summarize the sentiment of multiple articles for the overview dashboard heatmap.
*   **Aggregator Choice:** **Median**
    *   *Why Median?* Financial sentiment is highly prone to outlier biases (e.g., one extremely negative article skewing average perception). The median calculation maintains a robust center point.
*   **Process:**
    1. Collects sentiment lists for each topic across all matching articles.
    2. Filters out `None`/`null` values.
    3. Computes the **median** value of non-None entries (rounded to two decimal places).
    4. Computes **$N$ (Count)**: The number of articles that contained a non-null sentiment score for this topic.
    5. Returns a DataFrame sorted by $N$ descending (most discussed topics at the top).

---

### 3. Daily Aggregation (Time Series Charting)
*   **Source Logic:** `transform_sentiment(df)` in [functions.py](file:///Users/pravintakpire/datascience/Competitions/Hackathons/Gemini_Hackathon/MarketWave/functions.py)
*   **Purpose:** Format sentiment data to be plotted alongside stock price charts in the *Stock Price vs Sentiment* tab.
*   **Aggregator Choice:** **Mean (Average)**
    *   *Why Mean?* For temporal tracking, the average of daily sentiment scores provides a continuous scale that represents the overall daily market tone.
*   **Process:**
    1. Groups articles by date.
    2. For each date, loops through all matching article sentiment dictionaries.
    3. Computes the **average (mean)** score for each topic on that day.
    4. Formats it into a wide DataFrame format where rows are topics and columns are dates.
    5. Feeds the data into lightweight charts rendering tools (e.g. histogram columns under the stock price chart).
