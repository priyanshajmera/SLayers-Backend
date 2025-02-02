# Use lightweight Alpine image with Node.js
FROM node:20-alpine

# Install required dependencies
RUN apk add --no-cache python3 py3-pip py3-virtualenv

# Set working directory
WORKDIR /app

# Create and activate a Python virtual environment
RUN python3 -m venv /app/venv
ENV PATH="/app/venv/bin:$PATH"

# Install rembg inside the virtual environment
RUN pip install --no-cache-dir rembg

# Copy only package.json and package-lock.json
COPY package.json package-lock.json ./

# Install only production dependencies
RUN npm install --only=production

# Copy the rest of the backend files
COPY . .

# Expose the port
EXPOSE 3000

# Start the backend server
CMD ["npm", "start"]
