# Auckland pedestrian counts

This project downloads hourly pedestrian count data, appends the annual Excel files, cleans the data, and prepares files for a data visualization website.

## Pipeline

```bash
uv run python scripts/01_download_and_append.py
uv run python scripts/02_prepare_web_data.py
```