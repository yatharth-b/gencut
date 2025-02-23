AVAILABLE_TASK_FUNCTIONS = {
    "create_task": {
        "name": "create_task",
        "description": "Create a new task with a list of steps. The task starts at step 1. A new task should be created every time a user sends a message. The only available steps are: cutting a clip into two, moving a clip, altering the colors/brightness of a clip. Put each use of a tool in a new step. Each step should be a very basic and clear command in terms of which tool to apply to which clip. Consider that every time you cut a clip, a new clip will be created. You should mention which clip you want to make changes to using their clip IDs or their relative positioning like 'the third clip'",
        "parameters": {
            "type": "object",
            "properties": {
                "steps": {
                    "type": "array",
                    "items": {
                        "type": "string"
                    },
                    "description": "A list of steps for the new task."
                }
            },
            "required": ["steps"]
        }
    },
    "continue_task": {
        "name": "continue_task",
        "description": "Proceed to the next step in the current task after validating context given by the user.",
        "parameters": {
            "type": "object",
            "properties": {},
            "required": []
        }
    },
    "end_task": {
        "name": "end_task",
        "description": "Terminate the current task and clear its state given that the user's original task has been succesfully completed.",
        "parameters": {
            "type": "object",
            "properties": {},
            "required": []
        }
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
    },
    "deleteClip": {
        "name": "deleteClip",
        "description": "Deletes a clip from the timeline given it's clip ID.",
        "parameters": {
            "type": "object",
            "properties": {
                "clipId": {
                    "type": "string",
                    "description": "ID of the clip to delete"
                },
            }
        },
        "required": ["clipId"]
    }
}

