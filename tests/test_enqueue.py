import urllib.request
import json

data = json.dumps({"query": "Daft Punk Get Lucky"}).encode("utf-8")
req = urllib.request.Request(
    "http://127.0.0.1:8091/api/queue/add",
    data=data,
    headers={"Content-Type": "application/json"}
)
res = urllib.request.urlopen(req)
print(res.read().decode())
