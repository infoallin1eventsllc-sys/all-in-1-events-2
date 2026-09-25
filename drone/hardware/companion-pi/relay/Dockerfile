# A1 MAVLink relay. Build from this folder:
#   docker build -t a1-relay .
#   docker run -p 8780:8780 -e RELAY_AIRCRAFT_TOKEN=… -e RELAY_PILOT_TOKEN=… -e RELAY_VIEWER_TOKEN=… a1-relay
# Put TLS in front (the platform's edge, Caddy, nginx) and give dashboards the wss:// address.
FROM python:3.11-slim

ENV PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1
RUN pip install --no-cache-dir "websockets>=15" && useradd --system --no-create-home relay

WORKDIR /app
COPY relay.py .
USER relay

EXPOSE 8780
# Honors $PORT when the platform sets one (Render, Cloud Run); otherwise 8780.
CMD ["python3", "relay.py"]
