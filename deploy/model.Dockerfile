# Container for the existing FastAPI model service. Build context: ./adaptive-aqi-model
# (the submodule, used as-is). The trained artifact is NOT baked in: it is mounted
# read-only at /app/models, so the image never contains or alters it.
FROM python:3.12-slim
WORKDIR /app
# Exact versions the artifact was built with. The loader refuses a different scikit-learn.
RUN pip install --no-cache-dir numpy==1.26.4 pandas==2.1.4 scikit-learn==1.3.2 joblib==1.6.0 \
  "fastapi>=0.110,<1" "pydantic>=2.6,<3" "PyYAML>=6,<7" "uvicorn>=0.27,<1"
COPY api ./api
COPY src ./src
COPY configs ./configs
RUN useradd --system --uid 10001 model
USER model
EXPOSE 8000
# Healthy only when the artifact is loaded, so a missing model is visible in `docker ps`.
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD python -c "import json,sys,urllib.request; sys.exit(0 if json.load(urllib.request.urlopen('http://127.0.0.1:8000/health')).get('model_ready') else 1)"
CMD ["python", "-m", "uvicorn", "api.main:app", "--host", "0.0.0.0", "--port", "8000"]
