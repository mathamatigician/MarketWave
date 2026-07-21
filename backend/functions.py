import pandas as pd
import time
import numpy as np
from collections import defaultdict
from yahooquery import Ticker
import datetime
import os
from yahooquery import search
import json
import requests
import hashlib

def transform_date_sentiment(df):
    # Filter for only the overall_sentiment row
    overall_sentiment_df = df[df['Sentiment Topic'] == 'Overall sentiment']

    # Drop unnecessary columns
    overall_sentiment_df = overall_sentiment_df.drop(columns=['Sentiment Topic'])

    overall_sentiment_data = []
    for column in overall_sentiment_df.columns:
        value = overall_sentiment_df[column].iloc[0]
        if value == '' or value is None or pd.isna(value):
            continue

        try:
            val_float = float(value)
            import math
            if math.isnan(val_float) or math.isinf(val_float):
                continue

            # Make value positive and multiply by 100
            val_scaled = abs(val_float) * 100

            # Determine the color based on the original value
            color = 'rgba(0, 150, 136, 0.8)' if val_float >= 0 else 'rgba(255, 82, 82, 0.8)'

            # Convert date format to 'YYYY-MM-DD'
            date = pd.to_datetime(column, format='%m/%d/%Y').strftime('%Y-%m-%d')

            overall_sentiment_data.append({"time": date, "value": val_scaled, "color": color})
        except Exception:
            continue

    # Sort the list of dictionaries by date
    overall_sentiment_data.sort(key=lambda x: datetime.datetime.strptime(x["time"], '%Y-%m-%d'))

    return overall_sentiment_data


def get_ticker(company_name):
    search_result = search(company_name)
    if 'quotes' in search_result and search_result['quotes']:
        return search_result['quotes'][0]['symbol']
    return None


def get_stock_history(tkr, period, interval):
    try:
        ticker = Ticker(tkr)
        df = ticker.history(period=period, interval=interval)
        
        if df is None or (isinstance(df, dict) and 'error' in df) or getattr(df, 'empty', True):
            return []
            
        # reset index
        df.reset_index(inplace=True)
        
        # Keep only columns 'date' and the closest close column available
        close_col = 'adjclose'
        if 'adjclose' not in df.columns:
            for col in ['close', 'Close', 'adjClose']:
                if col in df.columns:
                    close_col = col
                    break
                    
        if 'date' not in df.columns or close_col not in df.columns:
            return []
            
        df = df[['date', close_col]].copy()
        df.rename(columns={close_col: 'adjclose'}, inplace=True)
        
        # Drop rows with NaN
        df = df.dropna(subset=['date', 'adjclose'])
        
        # Ensure the 'date' column is datetime-like
        df['date'] = pd.to_datetime(df['date'], errors='coerce', utc=True)
        df = df.dropna(subset=['date'])
        
        # Convert to time zone naive
        df['date'] = df['date'].dt.tz_convert(None)
        
        # Format the 'date' column to "YYYY-MM-DD"
        df['date'] = df['date'].dt.strftime('%Y-%m-%d')
        
        price_series = []
        for _, row in df.iterrows():
            val = row['adjclose']
            if pd.isna(val) or val is None:
                continue
            try:
                f_val = float(val)
                import math
                if math.isnan(f_val) or math.isinf(f_val):
                    continue
                price_series.append({"time": row['date'], "value": f_val})
            except (ValueError, TypeError):
                continue
                
        return price_series
    except Exception as e:
        print(f"Error in get_stock_history for {tkr}: {e}")
        return []


def aggregate_sentiment(sentiments: list):
    """
    Aggregates sentiment data across multiple dictionaries.

    For each topic, the function computes the median sentiment value across
    all input dictionaries, ignoring None values. If all values are None, the
    function returns (None, 0) for that topic. Otherwise, it returns a tuple
    with the median value rounded to two decimal places and the count of non-None
    entries for that topic.

    Parameters:
    ----------
    sentiments : list of dict
        A list of dictionaries where each dictionary represents sentiment
        data for different topics. The keys in each dictionary are topics,
        and the values are sentiment scores (between -1 and 1) or None.

    Returns:
    -------
    pandas.DataFrame
        A DataFrame where each row corresponds to a topic. The DataFrame has three columns:
        'sentiment topic' for the topic, 'value' for the median sentiment, and 'N' for the count
        of non-None entries.
    """
    topic_sentiments = defaultdict(list)

    # Collect the values for each topic
    for sentiment in sentiments:
        for topic, value in sentiment.items():
            topic_sentiments[topic].append(value)

    result = []

    # Compute the median for each topic or set to (None, 0) if all values are None
    for topic, values in topic_sentiments.items():
        non_none_values = [v for v in values if v is not None]
        if non_none_values:
            median_value = round(np.median(non_none_values), 2)
            weight = len(non_none_values)
            result.append({"Sentiment Topic": topic, "Sentiment Score": median_value, "N": weight})
        else:
            result.append({"Sentiment Topic": topic, "Sentiment Score": None, "N": 0})

    result_df = pd.DataFrame(result)

    # clean values in Sentiment Topic column
    result_df["Sentiment Topic"] = result_df["Sentiment Topic"].str.replace("_", " ").str.capitalize()

    # sort agg_df by N column in descending order
    result_df = result_df.sort_values('N', ascending=False)

    return result_df


def transform_sentiment(df: pd.DataFrame):
    """
    Transforms a dataframe of sentiment data into a wide format.

    The input dataframe should have two columns: 'date' and 'Sentiment'. The
    'Sentiment' column contains dictionaries mapping sentiment topics to their
    respective values. The function aggregates the sentiment values for each
    topic by date, ignoring None values, and calculates the average for each
    topic. The resulting dataframe has one column for each date and one row for
    each unique topic.

    Parameters:
    ----------
    df : pandas.DataFrame
        A dataframe with columns 'date' and 'Sentiment'. Each row contains a
        dictionary in 'Sentiment' column, mapping topics to sentiment scores
        or None.

    Returns:
    -------
    pandas.DataFrame
        A wide-format dataframe where the first column is 'sentiment topic'
        representing all unique topics, and subsequent columns are labeled by
        dates, containing the corresponding average sentiment values or None.
    """
    aggregated_data = defaultdict(lambda: defaultdict(list))

    import ast
    for index, row in df.iterrows():
        try:
            sentiment_map = ast.literal_eval(row["sentiment"])
        except Exception:
            sentiment_map = {}
        for topic, sentiment in sentiment_map.items():
            aggregated_data[row["date"]][topic].append(sentiment)

    aggregated_result = {}

    for date, topics in aggregated_data.items():
        result = {}
        for topic, values in topics.items():
            # Filter out None values
            non_none_values = [v for v in values if v is not None]
            if non_none_values:
                result[topic] = round(sum(non_none_values) / len(non_none_values), 2)
            else:
                result[topic] = None
        aggregated_result[date] = result

    # Step 2: Convert to wide format
    all_topics = set().union(*[d.keys() for d in aggregated_result.values()])
    wide_data = {'Sentiment Topic': list(all_topics)}

    for date, sentiments in aggregated_result.items():
        column_data = [sentiments.get(topic, None) for topic in all_topics]
        wide_data[date] = column_data

    wide_df = pd.DataFrame(wide_data)

    # Apply custom sorting
    wide_df = wide_df.sort_values('Sentiment Topic', key=lambda x: x.map(custom_sort_key))

    # sort columns by date except first column
    wide_df = wide_df[wide_df.columns[:1].tolist() + wide_df.columns[1:].sort_values().tolist()]

    # clean values in Sentiment Topic column
    wide_df["Sentiment Topic"] = wide_df["Sentiment Topic"].str.replace("_", " ").str.capitalize()

    return wide_df


def custom_sort_key(topic):
    return (0, '') if topic == 'overall_sentiment' else (1, topic)


import secrets
import hmac

def hash_password(password: str, salt: str = None) -> str:
    """Hashes a password using PBKDF2 with HMAC-SHA256."""
    if salt is None:
        salt = secrets.token_hex(16)
    key = hashlib.pbkdf2_hmac(
        'sha256',
        password.encode('utf-8'),
        salt.encode('utf-8'),
        100000
    )
    return f"{salt}:{key.hex()}"

def verify_password(password: str, stored_hash: str) -> bool:
    """Verifies a password against a stored hash securely."""
    if not stored_hash:
        return False
    if ":" not in stored_hash:
        # Fallback for old unsalted hashes
        legacy_hash = hashlib.sha256(password.encode('utf-8')).hexdigest()
        return hmac.compare_digest(legacy_hash, stored_hash)
    salt, _ = stored_hash.split(":", 1)
    expected_hash = hash_password(password, salt)
    return hmac.compare_digest(expected_hash, stored_hash)
