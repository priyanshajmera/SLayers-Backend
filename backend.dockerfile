# Use lightweight Alpine image with Node.js
FROM node:20-alpine AS build

# Install Python and pip (Alpine uses apk for package management)
RUN apk add --no-cache python3 py3-pip

# Install rembg
RUN pip3 install rembg

# Set working directory
WORKDIR /app

# Copy only package.json and package-lock.json
COPY package.json package-lock.json ./

# Install Node.js dependencies
RUN npm install --only=production

# Copy the rest of the backend files
COPY . .

# Expose the port
EXPOSE 3000

# Start the backend server
CMD ["npm", "start"]
