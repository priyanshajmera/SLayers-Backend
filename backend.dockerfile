# Use Node.js as the base image
FROM node:16

# Set working directory inside the container
WORKDIR /app

# Copy only package.json and package-lock.json to install dependencies
COPY package.json package-lock.json ./

# Install only production dependencies
RUN npm install --production

# Copy the rest of the backend files into the working directory
COPY . .

# Expose the port the backend will run on
EXPOSE 3000

# Start the backend server
CMD ["node", "server.js"]
