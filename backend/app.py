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
from moviepy import VideoFileClip
import utils
import math
from concurrent.futures import ThreadPoolExecutor
import atexit
import json
from function_call_def import AVAILABLE_TASK_FUNCTIONS, AVAILABLE_FUNCTIONS

# Load environment variables
load_dotenv()

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = Flask(__name__)
CORS(app, supports_credentials=True, resources={r"/*": {"origins": "*"}})

with app.app_context():
    tasks = {}
    task_id = 0

# Initialize OpenAI client
client = OpenAI(api_key=os.getenv('OPENAI_API_KEY'))

# # Define the available functions
# def trim_video(start_time: float, end_time: float) -> dict:
#     """
#     Function to trim a video between specified start and end times.
#     """
#     return {
#         "action": "trim_video",
#         "parameters": {
#             "start_time": start_time,
#             "end_time": end_time
#         }
#     }

# Define the available functions for OpenAI
AVAILABLE_FUNCTIONS = {
    "trim_video": {
        "name": "trim_video",
        "description": "Trim a video between specified start and end times. Interpret each frame as a second, and give the start time and end time in seconds. Make sure the end time is less than the duration of the video.",
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
                },
                "clipId": {
                    "type": "string",
                    "description": "ID of the clip to trim"
                }
            },
            "required": ["start_time", "end_time", "clipId"]
        }
    },
    "cutClip": {
        "name": "cutClip",
        "description": "Cut a video clip at a specified point",
        "parameters": {
            "type": "object",
            "properties": {
                "clipId": {
                    "type": "string",
                    "description": "ID of the clip to cut"
                },
                "cutPoint": {
                    "type": "number",
                    "description": "Time in seconds where the clip will be cut"
                }
            },
            "required": ["clipId", "cutPoint"]
        }
    }, 
    "adjustBrightness": {
        "name": "adjustBrightness", 
        "description": "Adjust the brightness level of a video. Evaluate the frames and think about what the best brightness level is for each part of the video. Give me the exact brightness level for the entire video needed.Range between 0 and 1 as a decimal.",
        "parameters": {
            "type": "object",
            "properties": {
                "clipId": {
                    "type": "string",
                    "description": "ID of the clip to adjust brightness for"
                },
                "brightness": {
                    "type": "number",
                    "description": "Brightness adjustment value (negative darkens, positive brightens)"
                }
            },
            "required": ["clipId", "brightness"]
        }
    },
    "moveClip": {
        "name": "moveClip",
        "description": "Moves a video clip to start from a specified location.",
        "parameters": {
            "type": "object",
            "properties": {
                "clipId": {
                    "type": "string",
                    "description": "ID of the clip to move"
                },
                "start": {
                    "type": "number",
                    "description": "Time in seconds where the clip will now start from"
                }
            },
            "required": ["clipId", "start"]
        }
    }
}

# Add conversation history storage
conversation_history = []

# At the top of the file, after imports
executor = ThreadPoolExecutor(max_workers=4)  # Create a global executor

def gpt_frame_desc(base64_image):
    messages = [
        {
            "role": "system",
            "content": "You are a helpful assistant for the blind. describe the frame as specificely as you can. be specific in terms of the colors in the frame, what might be happening to the best of your knowledge. be as specific as you can."
        },
        {"role": "user", "content": [
                {"type": "text", "text": f"Here is a frame from a video. Describe it vividly."},
                {
                    "type": "image_url",
                    "image_url": {
                        "url": f"data:image/jpeg;base64,{base64_image}"
                    }
                }
            ]}

    ]

    response = client.chat.completions.create(
        model="gpt-4o",
        messages=messages,
        max_tokens=500
    )

    return response.choices[0].message.content


def preprocess_image(video_duration, video_path):
    # returns image description per second and 
    print("in preprocess image")

    cap = cv2.VideoCapture(video_path)
    fps = cap.get(cv2.CAP_PROP_FPS)
    frames = []
    frame_count = 0

    attrs = []

    with ThreadPoolExecutor() as executor:
        while cap.isOpened():
            ret, frame = cap.read()
            if not ret:
                break
            
            if frame_count % int(fps) == 0:
                # Convert frame to JPEG
                _, buffer = cv2.imencode('.jpg', frame)
                base64_frame = base64.b64encode(buffer).decode('utf-8')
                
                # Submit the gpt_frame_desc call to the executor
                future = executor.submit(gpt_frame_desc, base64_frame)
                frames.append(future)  # Store the future object

                attrs.append({
                    "rgb_level": utils.get_rgb_levels(frame),
                    "saturation": utils.get_saturation(frame),
                    "contrast": utils.get_contrast(frame),
                    "brightness": utils.get_brightness(frame)
                })
            
            frame_count += 1

    cap.release()

    # Wait for all futures to complete and retrieve results
    frames = [future.result() for future in frames]

    return frames, attrs


def get_transcript(video_path):
    audio = VideoFileClip(video_path).audio
    audio_temp_dir = tempfile.mkdtemp()
    audio_path = os.path.join(audio_temp_dir, secure_filename(f'audio.wav'))
    print("audiopath")
    audio.write_audiofile(audio_path)

    # Use a context manager to ensure the file is closed after use
    with open(audio_path, "rb") as audio_file:
        transcript = client.audio.transcriptions.create(
            file=audio_file,
            model="whisper-1",
            response_format="verbose_json",
            timestamp_granularities=["word"]
        )

    sec_transcription = [[] for _ in range(math.ceil(transcript.duration))]

    for word in transcript.words:
        for sec in range(int(word.start), math.ceil(word.end)):
            sec_transcription[sec].append(word.word)

    for sec in range(len(sec_transcription)):
        sec_transcription[sec] = ' '.join(sec_transcription[sec])
    
    os.remove(audio_path)
    os.rmdir(audio_temp_dir)
    return sec_transcription[1:-1] 
    # This is because there is not really a message at 0 and last frame.. that should also be in the 1st and 2nd last timestamp

@app.route('/api/preprocess', methods=['POST'])
def preprocess():
    logger.info("Started processing")
    try:
        video_duration = float(request.form.get('duration', 0))
        video_file = request.files.get('video')

        if not video_file:
            return jsonify({'error': 'No video file provided'}), 400
        
        video_temp_dir = tempfile.mkdtemp()
        video_path = os.path.join(video_temp_dir, f"{secure_filename(video_file.name)}")
        video_file.save(video_path)

        future_image_desc = executor.submit(preprocess_image, video_duration, video_path)
        future_transcription = executor.submit(get_transcript, video_path)
        
        image_desc, attrs = future_image_desc.result()
        transcription = future_transcription.result()

        os.remove(video_path)
        os.rmdir(video_temp_dir)

        logger.info("Successfully finished preprocessing")

        return jsonify({
            'image_description': image_desc,
            'image_attr': attrs,
            'transcription': transcription
        })

    except Exception as e:
        logger.error(f"Error in chat endpoint: {str(e)}")
        return jsonify({'error': str(e)}), 500

def formatTime(seconds):
    minutes = int(seconds // 60)
    seconds = int(seconds % 60)
    return f"{minutes}:{seconds:02d}"

@app.route('/api/health', methods=['GET'])
def check_health():
    return jsonify({'healthy': 'true'})

def request_for_plan(clip_contexts, messages):

    # Prepare the messages to send to GPT
    formatted_messages = [{
        "role": "system",
        "content": f"You are the planner of an ai agent for video editing. You will be giving tasks to an editor. {AVAILABLE_TASK_FUNCTIONS['create_task']['description']}"
    }]

    for msg in messages:
        formatted_messages.append({
            "role": msg['role'],
            "content": msg['content']
        })

    formatted_messages.append({
        "role": "user",
        "content": f"here is the context for all my videos: {'-------------------------------------'.join(clip_contexts)}"
    })

    # Call GPT (with function_call enabled)
    response = client.chat.completions.create(
        model="gpt-4o",
        messages=formatted_messages,
        functions=[AVAILABLE_TASK_FUNCTIONS["create_task"]],
        function_call="auto",
    )

    print(response)

    response = response.choices[0].message

    if hasattr(response, 'function_call') and response.function_call:
        func_call = response.function_call
        function_name = func_call.name
        function_args_str = func_call.arguments  # This is typically a JSON string
        print(f"name  : {function_name}, args : {function_args_str}")
        try:
            args = json.loads(function_args_str)
        except Exception as e:
            logger.error(f"Failed to parse function arguments: {e}")
            args = {}

        logger.info(f"Function call received: {function_name} with arguments: {args}")

        # Execute the appropriate function based on the function call from GPT
        if function_name == "create_task":
            steps = args.get('steps', [])

            global task_id
            task_id += 1

            return create_task(task_id, steps, clip_contexts)

    return jsonify({
        "type": "message",
        "message": response.content
    })


@app.route('/api/chatv2', methods=['POST'])
def reasoning_chat():
    try:

        data = request.get_json()
        request_type = data['type']
        if request_type == 'new_chat':
            clip_contexts = data.get('clipContexts', [])
            messages = data.get('messages', [])
            return request_for_plan(clip_contexts, messages)
        elif request_type == 'continue_task':
          task_id = data['task_id']
          clip_contexts = data.get('clipContexts', [])
          return continue_task(task_id, clip_contexts)

    except Exception as e:
        logger.error(e)

def create_task(task_id, steps, clip_contexts):
    global tasks

    task = {
        "task_id": task_id,
        "steps": steps,
        "current_step": -1
    }
    print(task)

    tasks[task_id] = task
    return continue_task(task_id, clip_contexts)

def continue_task(task_id, clip_contexts):
    global tasks
    print('in continue task')
    print(task_id)
    print(tasks)
    print(tasks[task_id])
    
    tasks[task_id]["current_step"] += 1
    curr_step = tasks[task_id]["current_step"] 

    if curr_step == len(tasks[task_id]['steps']):
        return jsonify({
            "type": "task_end",
        })

    task = tasks[task_id]['steps'][curr_step]
    formatted_messages = [{
        "role": "system",
        "content": "You are the executor of an ai agent system for editing videos. You have available functions to edit videos and will be given the context of the each video in the timeline of the editor. You will also be given a list of steps and the current step we are on. ONLY execute the step you are currently on."
    }]

    formatted_messages.append({
        "role": "user",
        "content": f"here is the context for all my videos: {' '.join(clip_contexts)}"
    })

    previous_steps = "-------previous steps"

    for i in range(curr_step):
        previous_steps += f"{i + 1}. {tasks[task_id]['steps'][i]}\n"
    previous_steps += "\n-------------------------------"

    formatted_messages.append({
        "role": "user",
        "content": previous_steps
    })

    formatted_messages.append({
        "role": "user",
        "content": f"Here is the current step: {task}"
    })

    print(formatted_messages)

    response = client.chat.completions.create(
        model="gpt-4o",
        messages=formatted_messages,
        functions=[AVAILABLE_FUNCTIONS['cutClip'], AVAILABLE_FUNCTIONS['moveClip'], AVAILABLE_FUNCTIONS['deleteClip']],
        function_call="auto",
    )
    assistant_message = response.choices[0].message

    if hasattr(assistant_message, 'function_call') and assistant_message.function_call:
        return jsonify({
            "type": "function_call",
            "function_name": assistant_message.function_call.name,
            "function_args": assistant_message.function_call.arguments,
            "message": task,
            "task_id": task_id
        })

    else:
        return jsonify({
            "type": "message",
            "message": assistant_message.content
        })


# Ensure to shut down the executor when the application is stopped
atexit.register(executor.shutdown)

if __name__ == '__main__':
    logger.info("Starting Flask server...")
    app.run(host='0.0.0.0', port=5050, debug=True)