"""
Simple Streamlit App for Math Worksheet Checker
"""
import streamlit as st
import tempfile
from PIL import Image
from math_checker import SimpleMathChecker

st.set_page_config(page_title="Math Worksheet Checker", page_icon="📝", layout="wide")

st.title("📝 Math Worksheet Checker")
st.markdown("Upload a German math worksheet and get instant feedback!")

# Sidebar for API key
st.sidebar.title("🔑 Settings")
api_key = st.sidebar.text_input("OpenAI API Key", type="password")

if not api_key:
    st.warning("⚠️ Please enter your OpenAI API key in the sidebar")
    st.stop()

# Main interface
col1, col2 = st.columns([1, 1])

with col1:
    st.header("📤 Upload Worksheet")
    
    uploaded_file = st.file_uploader(
        "Choose worksheet image", 
        type=['png', 'jpg', 'jpeg']
    )
    
    if uploaded_file:
        # Display image
        image = Image.open(uploaded_file)
        st.image(image, caption="Original Worksheet", use_column_width=True)
        
        # Save temp file
        with tempfile.NamedTemporaryFile(delete=False, suffix='.png') as tmp:
            image.save(tmp.name)
            temp_path = tmp.name
        
        if st.button("🚀 Check Worksheet", type="primary"):
            with st.spinner("Analyzing worksheet..."):
                try:
                    # Initialize checker
                    checker = SimpleMathChecker(api_key)
                    
                    # Process
                    annotated_path, report, summary = checker.check_worksheet(temp_path)
                    
                    # Store results
                    st.session_state.results = {
                        'annotated_path': annotated_path,
                        'report': report,
                        'summary': summary
                    }
                    
                    st.success("✅ Analysis complete!")
                    
                except Exception as e:
                    st.error(f"❌ Error: {e}")

with col2:
    st.header("📊 Results")
    
    if 'results' in st.session_state:
        results = st.session_state.results
        summary = results['summary']
        
        # Enhanced summary metrics
        col2_1, col2_2, col2_3, col2_4, col2_5 = st.columns(5)
        with col2_1:
            st.metric("Total", summary['total'])
        with col2_2:
            st.metric("Perfect ✅✅", summary['perfect'])
        with col2_3:
            st.metric("Need Steps ✅⚠️", summary['correct_no_steps'])
        with col2_4:
            st.metric("Wrong ❌", summary['wrong'])
        with col2_5:
            st.metric("Empty ⚪", summary['empty'])
        
        # Show annotated image
        st.subheader("📝 Feedback")
        try:
            annotated_image = Image.open(results['annotated_path'])
            st.image(annotated_image, caption="With Feedback", use_column_width=True)
        except:
            st.error("Could not display annotated image")
        
        # Show report
        st.subheader("📋 Detailed Report")
        st.markdown(results['report'])
        
        # Download button
        with open(results['annotated_path'], 'rb') as f:
            st.download_button(
                "📥 Download Result",
                f,
                file_name="checked_worksheet.png",
                mime="image/png"
            )
    else:
        st.info("👆 Upload and check a worksheet to see results")

# Instructions
st.markdown("---")
st.markdown("""
### 🎯 Color System:
- **🟢 Green (✓✓)**: Perfect! Correct answer + proper steps
- **🟠 Orange (✓?)**: Correct answer but show your working
- **🔴 Red (✗)**: Wrong answer - check solution steps
- **🔵 Blue (?)**: Not answered yet

### 📝 Supported:
- German elementary math worksheets
- Addition problems
- Handwritten answers
""")

if __name__ == "__main__":
    pass
