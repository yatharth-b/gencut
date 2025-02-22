from flask import Flask, request, jsonify
from flask_cors import CORS
import logging
import os
from openai import OpenAI
from dotenv import load_dotenv
import base64

# Load environment variables
load_dotenv()

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = Flask(__name__)
CORS(app, supports_credentials=True, resources={r"/*": {"origins": "*"}})

# Initialize OpenAI client
client = OpenAI(api_key=os.getenv('OPENAI_API_KEY'))

# Define the available functions
def trim_video(start_time: float, end_time: float) -> dict:
    """
    Function to trim a video between specified start and end times.
    """
    return {
        "action": "trim_video",
        "parameters": {
            "start_time": start_time,
            "end_time": end_time
        }
    }

# Define the available functions for OpenAI
AVAILABLE_FUNCTIONS = {
    "trim_video": {
        "name": "trim_video",
        "description": "Trim a video between specified start and end times",
        "parameters": {
            "type": "object",
            "properties": {
                "start_time": {
                    "type": "number",
                    "description": "Start time in seconds"
                },
                "end_time": {
                    "type": "number",
                    "description": "End time in seconds"
                }
            },
            "required": ["start_time", "end_time"]
        }
    }
}

@app.route('/api/chat', methods=['POST'])
def chat():
    try:
        print("Received chat request")
        data = request.get_json()
        user_message = data.get('message')
        video_duration = data.get('videoDuration', 0)
        frames = data.get('frames', [])
        
        # Create frame descriptions for context
        frame_descriptions = []
        for frame in frames:
            frame_descriptions.append(f"Frame at {frame['time']} seconds: <image>{frame['data']}</image>")
        
        frame_context = "\n".join(frame_descriptions)
        
        system_message = f"""You are a helpful assistant that helps users trim videos. 
        The current video is {video_duration} seconds long.
        I have analyzed several frames from the video:
        {frame_context}
        
        Use this visual information to help understand the video content and provide better trimming suggestions."""

        response = client.chat.completions.create(
            model="gpt-4-vision-preview",  # Use vision model to process images
            messages=[
                {
                    "role": "system",
                    "content": system_message
                },
                {
                    "role": "user",
                    "content": user_message
                }
            ],
            functions=[AVAILABLE_FUNCTIONS["trim_video"]],
            function_call="auto",
            max_tokens=500
        )

        assistant_message = response.choices[0].message
        print("Assistant message:", assistant_message)

        # If there's a function call
        if hasattr(assistant_message, 'function_call') and assistant_message.function_call:
            function_name = assistant_message.function_call.name
            function_args = eval(assistant_message.function_call.arguments)
            
            result = trim_video(**function_args)
            return jsonify({
                "type": "function_call",
                "result": result,
                "message": assistant_message.content or "I'll help you trim the video."
            })

        # If it's just a regular message
        return jsonify({
            "type": "message",
            "message": assistant_message.content
        })

    except Exception as e:
        logger.error(f"Error in chat endpoint: {str(e)}")
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    logger.info("Starting Flask server...")
    app.run(host='0.0.0.0', port=5050, debug=True)

