# Floor-plan CV (local only)

Requires on your Mac:

```bash
python3 -c "import cv2; print(cv2.__version__)"
# if missing:
pip3 install opencv-python-headless numpy
```

Used by `POST /api/pipeline/jobs/:id/tour/assist` when not on Vercel
(`NODE_ENV !== production`, or `VISIO_LOCAL_CV=1`).

Never auto-writes tour data — the editor only shows suggestions.
