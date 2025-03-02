# SLayers Backend

A Node.js backend service for the SLayers application, providing wardrobe management and outfit recommendation features.

## Features

- User Authentication (signup/signin)
- Profile Management
- Wardrobe Management
- Outfit Recommendations using AI
- Virtual Try-on
- Favorites Management

## Tech Stack

- Node.js & Express.js
- PostgreSQL
- AWS S3 for image storage
- OpenAI & Google Gemini for AI features
- JWT for authentication

## Project Structure

```
src/
├── config/          # Configuration files
│   ├── database.js  # Database configuration
│   ├── aws.js       # AWS S3 configuration
│   ├── ai.js        # AI services configuration
│   └── multer.js    # File upload configuration
├── middleware/      # Middleware functions
│   └── auth.js      # Authentication middleware
├── routes/          # Route handlers
│   ├── auth.js      # Authentication routes
│   ├── user.js      # User profile routes
│   ├── outfit.js    # Outfit management routes
│   ├── favorite.js  # Favorites management routes
│   └── virtualTryOn.js # Virtual try-on routes
├── utils/           # Utility functions
│   └── helpers.js   # Helper functions
└── server.js        # Main application file
```

## Setup

1. Clone the repository:

   ```bash
   git clone <repository-url>
   cd slayers-backend
   ```

2. Install dependencies:

   ```bash
   npm install
   ```

3. Set up environment variables:

   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

4. Set up SSL certificates:
   Place your SSL certificates in the root directory:

   - `privkey.pem`
   - `fullchain.pem`

5. Start the server:

   ```bash
   # Development mode
   npm run dev

   # Production mode
   npm start
   ```

## API Endpoints

### Authentication

- POST `/signup` - Register new user
- POST `/signin` - User login

### User Profile

- GET `/profile` - Get user profile
- PUT `/profile` - Update user profile

### Wardrobe

- POST `/outfits/upload` - Upload new outfit
- GET `/outfits/wardrobe` - Get all outfits
- GET `/outfits/:id` - Get single outfit
- PUT `/outfits/:id` - Update outfit
- DELETE `/outfits/:id` - Delete outfit
- POST `/ootd` - Get outfit suggestions

### Favorites

- POST `/favorites` - Add to favorites
- GET `/favorites` - Get all favorites
- DELETE `/favorites/:id` - Remove from favorites

### Virtual Try-on

- POST `/virtualtryon` - Try on outfit combination

## Environment Variables

See `.env.example` for required environment variables.

## Contributing

1. Fork the repository
2. Create your feature branch
3. Commit your changes
4. Push to the branch
5. Create a new Pull Request
