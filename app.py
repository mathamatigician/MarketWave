import pandas as pd
import streamlit as st
import streamlit.components.v1 as components
from streamlit.components.v1 import html
import time
# from databricks import sql
import numpy as np
from collections import defaultdict
from streamlit_lightweight_charts import renderLightweightCharts
from yahooquery import Ticker
import datetime
from embedchain import App
from embedchain.config import BaseLlmConfig
import os
import functions
from yahooquery import search
import json
import requests
from streamlit_option_menu import option_menu


# wide streamlit format
st.set_page_config(page_title='GlobePulse', page_icon='🌍', layout='wide')

# read text from index.txt
with open('index.html', 'r') as file:
    html_content = file.read()

html(html_content, height=250)

# create a session state for login
if 'logged_in' not in st.session_state:
    st.session_state['logged_in'] = False
if 'mobile_prompts' not in st.session_state:
    st.session_state['mobile_prompts'] = 0
if 'phone_number' not in st.session_state:
    st.session_state['phone_number'] = ""
if 'show_phone_prompt' not in st.session_state:
    st.session_state['show_phone_prompt'] = False

server_hostname = "YOUR_SERVER_HOSTNAME"
http_path = "YOUR HTTP_PATH"
access_token = "YOUR_ACCESS TOKEN"

USERS_FILE = 'users.json'

def load_users():
    if os.path.exists(USERS_FILE):
        try:
            with open(USERS_FILE, 'r') as f:
                return json.load(f)
        except json.JSONDecodeError:
            return {}
    return {}

def save_users(users):
    with open(USERS_FILE, 'w') as f:
        json.dump(users, f, indent=4)

def login_page():
    st.markdown("<h2 style='text-align: center;'>Welcome to GlobePulse</h2>", unsafe_allow_html=True)
    col1, col2, col3 = st.columns([1, 2, 1])
    with col2:
        auth_mode = option_menu(
            menu_title=None,
            options=["Sign Up", "Log In"],
            icons=["person-plus", "box-arrow-in-right"],
            orientation="horizontal",
        )
        
        if auth_mode == "Log In":
            with st.form(key='login_form_only'):
                email = st.text_input(label='Email ID *')
                submit_button = st.form_submit_button(label='Log In')
                
                if submit_button:
                    if not email:
                        st.error("Please provide an Email ID.")
                    else:
                        users = load_users()
                        email_key = email.lower()
                        if email_key not in users:
                            st.error("User does not exist. Please Sign Up.")
                        else:
                            st.session_state['logged_in'] = True
                            phone = users[email_key].get('phone', '')
                            st.session_state['phone_number'] = phone
                            st.session_state['first_name'] = users[email_key]['first_name']
                            st.session_state['email'] = email_key
                            st.session_state['login_time'] = time.time()
                            if not phone:
                                st.session_state['show_phone_prompt'] = True
                            st.rerun()
                            
        else:
            with st.form(key='signup_form_main'):
                first_name = st.text_input(label='First Name *')
                last_name = st.text_input(label='Last Name')
                email = st.text_input(label='Email ID *')
                phone = st.text_input(label='Phone Number')
                submit_button = st.form_submit_button(label='Sign Up')
                
                if submit_button:
                    if not first_name or not email:
                        st.error("Please fill in First Name and Email ID.")
                    else:
                        users = load_users()
                        email_key = email.lower()
                        
                        if email_key in users:
                            st.error("User with this Email ID already exists. Please Log In.")
                        else:
                            users[email_key] = {
                                "first_name": first_name,
                                "last_name": last_name,
                                "email": email,
                                "phone": phone
                            }
                            save_users(users)
                            
                            st.session_state['logged_in'] = True
                            st.session_state['phone_number'] = phone
                            st.session_state['first_name'] = first_name
                            st.session_state['email'] = email_key
                            st.session_state['login_time'] = time.time()
                            if not phone:
                                st.session_state['show_phone_prompt'] = True
                            st.rerun()

if not st.session_state['logged_in']:
    login_page()
else:
    if st.session_state['show_phone_prompt'] and st.session_state['mobile_prompts'] < 3 and (time.time() - st.session_state.get('login_time', 0)) > 600:
        @st.dialog("Update Mobile Number")
        def update_phone_dialog():
            st.write("You haven't provided a mobile number. Please update it below:")
            new_phone = st.text_input("Mobile Number")
            col1, col2 = st.columns(2)
            with col1:
                if st.button("Update"):
                    st.session_state['phone_number'] = new_phone
                    st.session_state['show_phone_prompt'] = False
                    
                    users = load_users()
                    email_key = st.session_state.get('email')
                    if email_key and email_key in users:
                        users[email_key]['phone'] = new_phone
                        save_users(users)
                        
                    st.rerun()
            with col2:
                if st.button("Skip for now"):
                    st.session_state['mobile_prompts'] += 1
                    st.session_state['show_phone_prompt'] = False
                    st.rerun()
                    
        update_phone_dialog()
        
    with st.sidebar:
        st.write(f"Logged in as: {st.session_state.get('first_name', 'User')}")
        if st.button("Log Out"):
            st.session_state['logged_in'] = False
            st.session_state['show_phone_prompt'] = False
            st.rerun()

    watchlist = "Tesla"

    # load articles associated with the company
    # articles = functions.get_data(connection, watchlist)
    
    # convert to df
    # articles_df = pd.DataFrame(articles)
    articles_df = pd.read_csv('articles.csv')

    # close connection
    # connection.close()

    # rename columns to be: url, content, company_name, date, sentiment
    articles_df.columns = ['url', 'content', 'company_name', 'date', 'sentiment']

    # convert watchlist to list
    watchlist = watchlist.split(',')
    st.multiselect("Your Watchlist", watchlist, default=watchlist)

    tab1, tab2, tab3 = st.tabs(['Sentiment Analysis', 'Stock Price vs Sentiment', 'Chatbot'])

    # sentiment analysis tab
    with tab1:
        st.info('Below heatmaps present the sentiment analysis of the most recent news articles. The range of sentiment is from -1 to 1, where -1 is negative sentiment, 0 is neutral sentiment, and 1 is positive sentiment.')
        
        # replace null with None
        articles_df['sentiment'] = articles_df['sentiment'].apply(lambda x: x.replace('null', 'None'))

        # put sentiment column into a list
        sentiment_data = articles_df['sentiment'].tolist()

        # force convert to dict
        clean_sentiment_list = [eval(x) for x in sentiment_data]

        agg_df = functions.aggregate_sentiment(clean_sentiment_list)

        # keep only the date and Sentiment columns
        date_df = functions.transform_sentiment(articles_df[['date', 'sentiment']])

        # columns to list
        columns = date_df.columns.tolist()

        # drop sentiment topic from columns
        columns.remove('Sentiment Topic')

        # Apply gradient coloring
        styled_date_df = date_df.style.background_gradient(
            cmap="RdYlGn",
            subset=columns,
            vmin=-1,
            vmax=1
        ).format("{:.2f}", subset=columns)

        styled_agg_df = agg_df.style.background_gradient(
            cmap="RdYlGn",
            subset=['Sentiment Score'],
            vmin=-1,
            vmax=1
        ).format("{:.2f}", subset=['Sentiment Score'])

        col1, col2 = st.columns(2)

        with col1:
            st.dataframe(styled_date_df, hide_index=True, use_container_width=True)
        with col2:
            st.dataframe(styled_agg_df, hide_index=True, use_container_width=True)


    # stock price vs sentiment tab
    with tab2:

        st.info("The histogram shows the sentiment score of the articles published on a given date. The color represents negative or positive sentiment and the value is intensity (0-100)."
                "The stock price is plotted on the area chart.")
    
        # load stock price data
        # tkr = functions.get_ticker(watchlist[0])
        
        price_series = functions.get_stock_history('TSLA', '30d', '1d')

        priceVolumeSeriesHistogram = functions.transform_date_sentiment(date_df)

        functions.plot_chart(price_series, priceVolumeSeriesHistogram)

    # chatbot tab. For demo purposes will use embedchain and a few sample news articles.
    with tab3:
        st.info("The chatbot is trained only on selected articles for demo purposes")

        urls = ["https://www.msn.com/en-us/autos/news/tesla-s-supercharger-layoffs-couldn-t-have-come-at-a-worse-time/ar-AA1o6uYb",
                "https://www.msn.com/en-us/money/news/i-landed-a-dream-internship-at-tesla-now-im-scrambling-after-the-company-cancelled-my-internship-3-weeks-before-i-was-set-to-start/ar-AA1o3OFp",
                "https://www.wired.com/story/tesla-supercharger-pullback-filling-the-power-gap/",
                "https://www.ft.com/content/114effb2-1071-4d93-b53d-00a96a0336a2",
                "https://www.msn.com/en-us/money/companies/elimination-of-teslas-charging-department-raises-worries-as-evs-from-other-automakers-join-network/ar-AA1nZzGg",
                "https://www.msn.com/en-us/money/companies/tesla-lays-off-hundreds-of-employees-on-electric-vehicle-charger-team/ar-AA1nZsPe",
                "https://www.msn.com/en-us/autos/news/tesla-staff-say-entire-supercharger-team-fired/ar-AA1nYAl8",
                "https://www.msn.com/en-us/money/other/tesla-retreat-from-ev-charging-leaves-growth-of-u-s-network-in-doubt/ar-AA1o64CD",
                "https://arstechnica.com/cars/2024/05/chaos-at-tesla-what-analysts-think-about-elon-musks-cuts-and-layoffs/"
                ]

        # set openai api key (fall back to env var; degrade gracefully if missing)
        try:
            api_key = st.secrets["openai_credentials"]["API_KEY"]
        except Exception:
            api_key = os.environ.get("OPENAI_API_KEY")

        if not api_key:
            st.warning(
                "Chatbot disabled: set `[openai_credentials] API_KEY` in "
                "`.streamlit/secrets.toml` or the `OPENAI_API_KEY` environment variable."
            )
            st.stop()

        os.environ["OPENAI_API_KEY"] = api_key

        bot = functions.load_bot(urls)
        query_config = BaseLlmConfig(number_documents=1)

        if "messages" not in st.session_state.keys():  # Initialize the chat messages history
            st.session_state.messages = [
                {"role": "assistant", "content": "Ask me a question!"}]

        if prompt := st.chat_input("Your question"):  # Prompt for user input and save to chat history
            st.session_state.messages.append({"role": "user", "content": prompt})

        for message in st.session_state.messages:  # Display the prior chat messages
            # if role is user
            if message["role"] == "user":
                with st.chat_message(message["role"]):
                    st.write(message["content"])
            elif message["role"] == "assistant":
                with st.chat_message(message["role"]):
                    st.write(message["content"])

        # If last message is not from assistant, generate a new response
        if st.session_state.messages[-1]["role"] != "assistant":
            with st.chat_message("assistant"):
                with st.spinner("Thinking..."):
                    response, citations = bot.chat(prompt, citations=True, config=query_config)

                    sources = functions.get_sources(citations)
                    # italicized_sources = [f"*{source}*" for source in sources]

                    full_response = response + "\n\n**Source**:\n" + f"*{sources[0]}*"

                    st.write(full_response)

                    message = {"role": "assistant", "content": full_response}
    #                 st.session_state.messages.append(message)  # Add response to message history


