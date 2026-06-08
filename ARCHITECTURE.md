# GlobePulse — Architecture & Information Flow

GlobePulse is a financial-news **sentiment monitoring** app. It has two distinct halves:

| Plane | Status in this repo | Where it lives |
|-------|--------------------|----------------|
| **Online app** (serving / demo) | ✅ Active — what runs today | `app.py`, `functions.py`, `index.html`, `articles.csv`, `openai.yaml`, `.streamlit/` |
| **Offline data pipeline** (ingest + enrich) | 💤 Dormant — present but disabled | `databricks_notebooks/*.ipynb` (Databricks calls in `app.py`/`functions.py` are commented out) |

The live demo decouples itself from Databricks by reading a **static `articles.csv`** snapshot instead of querying the Delta tables that the notebooks would normally populate.

---

## 1. Current (Live Demo) Architecture

This is what actually executes when you run `streamlit run app.py`.

```mermaid
flowchart TB
    user(("👤 User<br/>Browser"))

    subgraph ST["Streamlit App (app.py)"]
        header["index.html banner<br/>(components.html)"]
        sidebar["Sidebar login form<br/>(disabled — demo)"]
        state["session_state<br/>logged_in=True · watchlist='Tesla'"]

        subgraph TABS["st.tabs"]
            t1["Tab 1 — Sentiment Analysis"]
            t2["Tab 2 — Price vs Sentiment"]
            t3["Tab 3 — Chatbot"]
        end
    end

    subgraph FN["functions.py (helpers)"]
        agg["aggregate_sentiment()<br/>median per topic"]
        trans["transform_sentiment()<br/>wide-by-date table"]
        tds["transform_date_sentiment()<br/>histogram series"]
        gsh["get_stock_history()<br/>@cache_data"]
        plot["plot_chart()<br/>lightweight-charts"]
        bot["load_bot()<br/>@cache_resource"]
        src["get_sources()"]
    end

    csv[("articles.csv<br/>static snapshot")]
    yaml[["openai.yaml<br/>llm config"]]
    secrets[["st.secrets / env<br/>OPENAI_API_KEY"]]

    yf["Yahoo Finance<br/>(yahooquery)"]
    emb["embedchain App<br/>+ local Chroma vector store"]
    openai["OpenAI API<br/>gpt-3.5-turbo"]
    urls["9 hard-coded<br/>Tesla news URLs"]

    user <--> ST
    header -.reads.-> idx[["index.html"]]
    state --> TABS

    t1 --> csv
    t1 --> agg & trans
    t2 --> gsh --> yf
    t2 --> tds --> plot
    t3 --> secrets
    t3 --> bot
    bot --> yaml
    bot --> emb
    emb --> urls
    emb --> openai
    t3 --> src

    classDef ext fill:#fde,stroke:#c39;
    classDef data fill:#eef,stroke:#669;
    class yf,openai,urls ext;
    class csv,yaml,secrets,idx data;
```

![Current (live demo) architecture](docs/diagrams/01_current_architecture.png)

### Per-tab behaviour

- **Tab 1 — Sentiment Analysis** (`app.py:95-138`)
  Reads `articles.csv`, normalises the `sentiment` JSON string (`null → None`, then `eval`), then:
  - `aggregate_sentiment()` → median score per topic across all articles (a ranked summary table).
  - `transform_sentiment()` → wide table (rows = topics, columns = dates).
  Both are rendered as `RdYlGn` gradient heatmaps via pandas Styler.

- **Tab 2 — Price vs Sentiment** (`app.py:142-154`)
  `get_stock_history('TSLA', '30d', '1d')` pulls adjusted close prices from **Yahoo Finance**; `transform_date_sentiment()` turns the overall-sentiment row into a colored histogram series. `plot_chart()` overlays both on a TradingView **lightweight-charts** panel (area = price, histogram = sentiment intensity).

- **Tab 3 — Chatbot** (`app.py:157-207`)
  `load_bot()` builds an **embedchain** `App` from `openai.yaml`, embeds 9 hard-coded Tesla article URLs into a local **Chroma** vector store, and answers questions via RAG against the **OpenAI** API. The `OPENAI_API_KEY` is read from `st.secrets` with an env-var fallback and a graceful "disabled" warning if absent (`app.py:171-185`).

> **Note on tab execution:** Streamlit runs *all three* `with tab:` blocks on every rerun — tabs are switched client-side. That is why a missing key in Tab 3 previously crashed the whole page, and why the secret read is now guarded.

---

## 2. Original (Intended) Databricks Pipeline

The notebooks describe the production ingest path that the app was designed to consume. It is currently bypassed (the `databricks.sql` connection and `get_data`/`find_user` helpers are commented out), but it explains where `articles.csv`'s columns and the sentiment schema come from.

```mermaid
flowchart LR
    subgraph NB1["01 · Scrape, Clean & Load"]
        u[("users table<br/>watchlist")] --> ddg["DuckDuckGo News API<br/>(RapidAPI)"]
        ddg --> sg["ScrapeGraphAI + Playwright<br/>extract article text"]
        sg --> clean["clean text + dates<br/>(regex)"]
    end

    subgraph NB2["02 · Extract & Analyze Sentiment"]
        llm1["ChatDatabricks (dbrx-instruct)<br/>+ Pydantic 18-topic schema"]
    end

    subgraph NB3["03 · RAG Index"]
        split["RecursiveCharacterTextSplitter<br/>chunk 1000/200"]
        vidx["Databricks Vector Search<br/>bge-large-en embeddings"]
    end

    art[("Delta: hackathon_schema.articles")]
    srct[("Delta: source_table<br/>CDF enabled")]

    clean --> art
    art --> llm1 --> |MERGE sentiment col| art
    art --> split --> srct --> vidx

    art -.exported snapshot.-> csv[("articles.csv")]
    csv -.consumed by.-> app["Streamlit app"]

    classDef ext fill:#fde,stroke:#c39;
    class ddg,sg,llm1,vidx ext;
```

![Original Databricks pipeline](docs/diagrams/02_databricks_pipeline.png)

| Notebook | Role | Key tech |
|----------|------|----------|
| `01. Scrape, Clean & Load` | Create `users`/`articles` tables; fetch news URLs per watchlist company; scrape & clean full text; append to Delta | DuckDuckGo (RapidAPI), ScrapeGraphAI, Playwright, Spark/Delta |
| `02. Extract & Analyze Sentiment` | Per-topic structured sentiment (18 topics, −1..1 or null) and `MERGE` back into `articles.sentiment` | LangChain, ChatDatabricks `dbrx-instruct`, Pydantic |
| `03. RAG` | Chunk articles → `source_table` → continuous Vector Search index for retrieval QA | Databricks Vector Search, `bge-large-en`, RetrievalQA |

> In the **live app**, Notebook 02's sentiment schema is reproduced in `articles.csv`'s `sentiment` column, and Notebook 03's Databricks Vector Search is replaced by embedchain + local Chroma over a handful of URLs.

---

## 3. Information Flow (Request Lifecycle)

End-to-end sequence for a single page load + a chatbot question.

```mermaid
sequenceDiagram
    autonumber
    participant U as User (browser)
    participant S as Streamlit (app.py)
    participant F as functions.py
    participant C as articles.csv
    participant Y as Yahoo Finance
    participant E as embedchain + Chroma
    participant O as OpenAI API

    U->>S: Open app / rerun
    S->>S: render index.html banner + sidebar (login disabled)
    S->>S: session_state.logged_in=True, watchlist="Tesla"

    rect rgb(235,245,255)
    note over S,F: Tab 1 — Sentiment (runs every rerun)
    S->>C: pd.read_csv()
    C-->>S: articles dataframe
    S->>F: aggregate_sentiment() / transform_sentiment()
    F-->>S: ranked + wide sentiment tables
    S-->>U: gradient heatmaps
    end

    rect rgb(235,255,240)
    note over S,Y: Tab 2 — Price vs Sentiment
    S->>F: get_stock_history('TSLA','30d','1d')
    F->>Y: ticker.history()  (cached)
    Y-->>F: price series
    S->>F: transform_date_sentiment() + plot_chart()
    F-->>U: overlaid price/sentiment chart
    end

    rect rgb(255,245,235)
    note over S,O: Tab 3 — Chatbot
    S->>S: read OPENAI_API_KEY (secrets→env, else warn+stop)
    S->>F: load_bot(urls)  (cached resource)
    F->>E: embed 9 URLs into Chroma
    U->>S: ask question
    S->>E: bot.chat(prompt, citations=True)
    E->>O: retrieve + generate (gpt-3.5-turbo)
    O-->>E: answer
    E-->>S: response + citations
    S->>F: get_sources(citations)
    S-->>U: answer + source link
    end
```

![Information flow — request lifecycle](docs/diagrams/03_information_flow.png)

### How the data is shaped along the way

1. **Source record** (`articles.csv` row): `url, content, company_name, date, sentiment`. The `sentiment` field is a JSON string mapping 18 topics → score in `[-1, 1]` or `null` (e.g. `overall_sentiment`, `layoffs`, `revenue_growth`, …).
2. **Sentiment plane** splits two ways: a **topic median** summary (`aggregate_sentiment`) and a **topic × date** matrix (`transform_sentiment`). The `overall_sentiment` row is further reshaped into a signed-color histogram series for the price chart.
3. **Price plane** is fetched independently from Yahoo Finance and joined *visually* (shared time axis) rather than in data — sentiment and price are two overlaid series, not a merged table.
4. **Chat plane** is fully independent of the CSV: it builds its own retrieval index from hard-coded URLs and talks to OpenAI.

---

## 4. Key Files

| File | Responsibility |
|------|----------------|
| `app.py` | Streamlit entrypoint, layout, tabs, session state, secret handling |
| `functions.py` | Pure helpers: sentiment aggregation/transform, stock fetch, chart render, bot loader (cached) |
| `articles.csv` | Static demo dataset (stand-in for the Delta `articles` table) |
| `openai.yaml` | embedchain LLM config (`gpt-3.5-turbo-0125`, temp 0, streaming) |
| `index.html` | HTML/CSS hero banner injected at top of the page |
| `.streamlit/config.toml` | Dark theme + orange primary color |
| `.streamlit/secrets.toml` | (not committed) `[openai_credentials] API_KEY` for the chatbot |
| `databricks_notebooks/` | Dormant offline pipeline: ingest → sentiment → RAG index |

## 5. External Dependencies

| Service | Used by | Required for |
|---------|---------|--------------|
| Yahoo Finance (`yahooquery`) | Tab 2 | Stock price chart |
| OpenAI API | Tab 3 (via embedchain) | Chatbot answers |
| Chroma (local, bundled w/ embedchain) | Tab 3 | Vector store for RAG |
| *(dormant)* Databricks Delta + Vector Search, DuckDuckGo/RapidAPI, ScrapeGraphAI | notebooks | Production ingest/enrich |
