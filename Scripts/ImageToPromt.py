import os
import base64
import rembg
import warnings
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from PIL import Image
from io import BytesIO

# 🔹 Prevent torch from using GPU (if installed)
os.environ["U2NET_ENABLE_CUDA"] = "0"

# 🔹 Suppress `timm` warnings (optional)
warnings.filterwarnings("ignore", category=FutureWarning, module="timm.models.layers")

# 🔹 Initialize FastAPI app
app = FastAPI()

class Base64Image(BaseModel):
    image_base64: str

def remove_background(image: Image.Image, resize: tuple = (512, 512)):
    """Removes background and resizes image efficiently."""
    
    if image.mode not in ["RGB", "RGBA"]:
        image = image.convert("RGBA")  # Handle transparency

    # Convert to bytes
    input_bytes = BytesIO()
    image.save(input_bytes, format="PNG")  # PNG ensures transparency support
    input_bytes = input_bytes.getvalue()

    # Process with rembg
    output_bytes = rembg.remove(input_bytes)
    result = Image.open(BytesIO(output_bytes))

    # Resize efficiently with LANCZOS
    result = result.resize(resize, Image.LANCZOS)

    return result

@app.post("/remove-background/")
@app.post("/remove-background")
async def remove_background_base64(data: Base64Image, width: int = 512, height: int = 512):
    """Removes background and resizes to given dimensions (default: 512x512)."""
    try:
        image_data = base64.b64decode(data.image_base64)
        image = Image.open(BytesIO(image_data))

        # Process image
        processed_image = remove_background(image, resize=(width, height))

        # Convert output to base64
        output_bytes = BytesIO()
        processed_image.save(output_bytes, format="PNG")
        output_bytes.seek(0)
        processed_image_base64 = base64.b64encode(output_bytes.read()).decode("utf-8")

        return {
            "message": "Background removed successfully",
            "image_base64": processed_image_base64,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=5000, workers=4)
