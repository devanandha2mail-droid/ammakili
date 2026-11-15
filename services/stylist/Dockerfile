FROM python:3.12-slim
RUN apt-get update && apt-get install -y --no-install-recommends libgomp1 && rm -rf /var/lib/apt/lists/*
RUN useradd -m app
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
USER app
# download the two models into the image once, so the first request is fast and works offline
RUN python -c "from rembg import new_session; new_session('isnet-general-use'); new_session('u2net_cloth_seg')"
COPY --chown=app stylist ./stylist
ENV STYLIST_THREADS=2
EXPOSE 8001
# bind to all interfaces INSIDE the container; do not publish this port to the internet
CMD ["uvicorn", "stylist.app:app", "--host", "0.0.0.0", "--port", "8001", "--workers", "1"]
