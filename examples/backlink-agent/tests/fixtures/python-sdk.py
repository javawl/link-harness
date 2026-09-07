"""Project real publisher events through the Python SDK over stdio JSON-RPC."""

import json
import sys

from deepseek_harness import DeepSeekHarness


launch = json.loads(sys.argv[1])
with DeepSeekHarness(
    launch_args_override=(launch["command"], *launch["args"]),
    cwd=launch["cwd"],
    env=launch["env"],
    provider="mock",
    model="mock",
    request_timeout_seconds=60,
) as harness:
    result = harness.run("Publish fixture batch 176.", session_id="backlinks-sdk")
    print(json.dumps({
        "finalResponse": result.final_response,
        "attempts": [event["data"] for event in result.events if event["type"] == "backlinks/attempt"],
    }))
