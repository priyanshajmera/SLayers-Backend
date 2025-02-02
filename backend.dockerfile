# First stage: Install dependencies
FROM node:20.10.0-bullseye AS build

# Install Python and pip
RUN apt-get update && apt-get install -y python3 python3-pip

# Install rembg
RUN pip3 install rembg

# Second stage: Use a clean Node.js image for runtime
FROM node:20.10.0-bullseye

# Copy Python and rembg from the first stage
COPY --from=build /usr/local/lib/python3.*/ /usr/local/lib/python3.*/
COPY --from=build /usr/bin/python3 /usr/bin/python3
COPY --from=build /usr/bin/pip3 /usr/bin/pip3

# Set working directory
WORKDIR /app

# Copy only package.json and package-lock.json
COPY package.json package-lock.json ./

# Install Node.js dependencies
RUN npm install

# Copy the rest of the backend files
COPY . .

# Expose the port the backend will run on
EXPOSE 3000

# Start the backend server
CMD ["npm", "start"]
