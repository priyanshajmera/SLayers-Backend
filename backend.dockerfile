# Use a smaller base image
FROM node:20.10.0-alpine

# Set working directory inside the container
WORKDIR /app

# Copy package files first for efficient caching
COPY package.json package-lock.json ./

# Install only production dependencies
RUN npm ci --only=production

# Copy the rest of the application files
COPY . .

# Expose the application port
EXPOSE 3000

# Start the backend server
CMD ["npm", "start"]
