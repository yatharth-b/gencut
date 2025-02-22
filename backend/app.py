from flask import Flask, request, jsonify
from flask_cors import CORS
import logging
import os
from openai import OpenAI
from dotenv import load_dotenv
import cv2
import numpy as np
import base64
from werkzeug.utils import secure_filename
import tempfile

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

# Add conversation history storage
conversation_history = []

@app.route('/api/chat', methods=['POST'])
def chat():
    try:
        user_message = request.form.get('message')
        video_duration = float(request.form.get('duration', 0))
        video_file = request.files.get('video')

        if not video_file:
            return jsonify({'error': 'No video file provided'}), 400

        # Save video to temporary file
        temp_dir = tempfile.mkdtemp()
        video_path = os.path.join(temp_dir, secure_filename(video_file.filename))
        video_file.save(video_path)

        # Extract frames using OpenCV
        cap = cv2.VideoCapture(video_path)
        fps = cap.get(cv2.CAP_PROP_FPS)
        frames = []
        frame_count = 0

        while cap.isOpened():
            ret, frame = cap.read()
            if not ret:
                break
                
            # Extract one frame per second
            if frame_count % int(fps) == 0:
                # Convert frame to JPEG
                _, buffer = cv2.imencode('.jpg', frame)
                base64_frame = base64.b64encode(buffer).decode('utf-8')
                print(base64_frame)
                
                # Add frame in GPT-4 Vision format
                frames.append({
                    "type": "image_url",
                    "image_url": {
                        "url": f"data:image/jpeg;base64,{base64_frame}"
                    }
                })
            
            frame_count += 1
            
            # Limit to first 10 seconds of frames
            if frame_count >= fps * 10:
                break

        cap.release()
        
        # Cleanup
        os.remove(video_path)
        os.rmdir(temp_dir)

        # Prepare message content
        content = [
            {
                "type": "text",
                "text": f"The video is {video_duration} seconds long. {user_message}"
            }
        ]
        content.extend(frames)

        messages = [
            {
                "role": "system",
                "content": "You are a helpful assistant that helps users trim videos or answer questions based on the video."
            },
            {
                "role": "user",
                "content": content
            }
        ]

        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=messages,
            functions=[AVAILABLE_FUNCTIONS["trim_video"]],
            function_call="auto",
            max_tokens=500
        )

        assistant_message = response.choices[0].message
        print(assistant_message)
        # Update conversation history
        # conversation_history.append({
        #     "role": "user",
        #     "content": user_message  # Store text only for history
        # })
        # conversation_history.append({
        #     "role": "assistant",
        #     "content": assistant_message.content
        # })

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

