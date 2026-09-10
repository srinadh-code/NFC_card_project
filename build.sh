#!/usr/bin/env bash
# Render build step (see render.yaml's buildCommand). Never run this
# locally — local development uses `pip install -r requirements.txt` and
# `python manage.py runserver` directly, no build script involved.
set -o errexit

pip install -r requirements.txt

python manage.py collectstatic --no-input

python manage.py migrate
