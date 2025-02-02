# Use a Node.js image with Python support
FROM node:20.10.0-bullseye

# Install Python and pip
RUN apt-get update && apt-get install -y python3 python3-pip

# Set working directory inside the container
WORKDIR /app

# Copy only package.json and package-lock.json to install dependencies
COPY package.json package-lock.json ./

# Install only production dependencies
RUN npm install
RUN npm audit fix --force

# Install rembg
RUN pip3 install rembg onnxruntime asyncer click filetype aiohttp gradio

# Copy the rest of the backend files into the working directory
COPY . .

# Expose the port the backend will run on
EXPOSE 3000

# Start the backend server
CMD ["npm", "start"]
