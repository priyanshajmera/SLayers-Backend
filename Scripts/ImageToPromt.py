import subprocess
import torch
from PIL import Image
from transformers import AutoProcessor, AutoModelForCausalLM





def generate_caption(image):
    if not isinstance(image, Image.Image):
        image = Image.fromarray(image)
    
    inputs = florence_processor(text=caption, images=image, return_tensors="pt").to(device)
    generated_ids = florence_model.generate(
        input_ids=inputs["input_ids"],
        pixel_values=inputs["pixel_values"],
        max_new_tokens=50,
        early_stopping=False,
        do_sample=False,
        num_beams=3,
    )
    generated_text = florence_processor.batch_decode(generated_ids, skip_special_tokens=False)[0]
    parsed_answer = florence_processor.post_process_generation(
        generated_text,
        task=caption,
        image_size=(image.width, image.height)
    )
    prompt =  parsed_answer[caption]
    
    return prompt

# Example usage
if __name__ == "__main__":
    import sys
    # Initialize Florence model
    import warnings
    warnings.filterwarnings("ignore", category=FutureWarning, module="timm.models.layers")
    device = "cuda" if torch.cuda.is_available() else "cpu"
    caption="Describe clothing and ignore the background."
    
    florence_model = AutoModelForCausalLM.from_pretrained('microsoft/Florence-2-base', trust_remote_code=True).to(device)
    florence_processor = AutoProcessor.from_pretrained('microsoft/Florence-2-base', trust_remote_code=True)
    if len(sys.argv) < 2:
        print("Usage: python script.py <image_path>")
        sys.exit(1)
    
    image_path = sys.argv[1]
    
    try:
        input_image = Image.open(image_path)
        output_prompt = generate_caption(input_image)
        print(f"{output_prompt}")
    except Exception as e:
        print(f"Error: {str(e)}")
