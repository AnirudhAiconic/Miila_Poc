# 📝 Simple Math Worksheet Checker

A clean, simple solution for checking German math worksheets using AI vision.

## 🚀 What it does

- **Analyzes** German math worksheets using GPT-4 Vision
- **Reads** handwritten answers directly from images  
- **Validates** answers and shows colored feedback boxes
- **Generates** detailed reports

## 📋 Color System

- **🟢 Green**: Correct answer
- **🔴 Red**: Wrong answer
- **🔵 Blue**: Not answered

## 🛠️ Setup

1. **Install dependencies:**
```bash
pip install -r requirements.txt
```

2. **Get OpenAI API key:**
- Go to https://platform.openai.com/api-keys
- Create new key
- Make sure you have GPT-4 access

3. **Run the app:**
```bash
streamlit run app.py
```

## 💻 Usage

1. Open the web app at `http://localhost:8501`
2. Enter your OpenAI API key in the sidebar
3. Upload a German math worksheet image
4. Click "Check Worksheet"
5. See instant feedback with colored boxes!

## 🎯 Features

- **Direct AI Analysis**: Uses GPT-4 Vision to read worksheets
- **Simple & Clean**: No complex OCR preprocessing  
- **Real Results**: Only reports what's actually visible
- **Visual Feedback**: Clear colored boxes on answers
- **Detailed Reports**: Step-by-step breakdown

## 📁 Files

- `math_checker.py` - Core analysis engine
- `app.py` - Streamlit web interface
- `requirements.txt` - Dependencies
- `README.md` - This file

## 🧪 For Your Worksheets

Perfect for German elementary math like:
- Addition problems (426 + 267 = ___)
- "Rechne auf deinem Weg" sections
- Handwritten student answers

## 🔧 How It Works

1. **AI Vision Analysis**: GPT-4o examines the entire worksheet
2. **Problem Detection**: Finds the 6 main exercise problems
3. **Answer Reading**: Reads handwritten numbers directly
4. **Validation**: Checks if answers are mathematically correct
5. **Visual Feedback**: Draws colored boxes with results

**Simple. Clean. Effective.** ✨
