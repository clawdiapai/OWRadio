#!/usr/bin/env bash
curl -s -X POST http://127.0.0.1:8091/api/queue/add \
  -H 'Content-Type: application/json' \
  -d '{"query": "Daft Punk - One More Time"}'
echo ""
curl -s http://127.0.0.1:8091/api/nowplaying
echo ""
