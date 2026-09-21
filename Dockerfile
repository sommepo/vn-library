FROM python:3.14.4-slim-bookworm
WORKDIR /app
COPY vnkit /app/vnkit
COPY web /app/web
COPY fixtures /app/fixtures
COPY LICENSE /app/LICENSE
COPY third_party/*.txt /app/third_party/
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
USER 1000:1000
CMD ["python", "-m", "vnkit", "serve", "--library", "/library", "--state", "/state"]
