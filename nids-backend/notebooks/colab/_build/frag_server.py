# %% [markdown]
# ## 🚀 Step 5 — Start the API server (background thread)
#
# Uvicorn runs in a daemon thread so the notebook stays interactive.
# `/docs` (Swagger UI) will be available on the public URL created later.

# %%
import threading
import uvicorn

_config = uvicorn.Config(app, host="0.0.0.0", port=API_PORT, log_level="warning")
_server = uvicorn.Server(_config)
_server_thread = threading.Thread(target=_server.run, daemon=True)
_server_thread.start()

import time as _time
import requests as rq
_health = None
for _ in range(30):
    _time.sleep(1)
    try:
        _health = rq.get(f"{API_BASE}/health", timeout=2).json()
        break
    except Exception:
        continue
print("Server health:", _health)
assert _health and _health.get("status") == "ok", "API did not come up — check the cell output above."
print(f"API live at {API_BASE}  (Swagger docs at {API_BASE}/docs)")
