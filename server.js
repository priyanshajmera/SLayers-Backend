// Import necessary modules
import express from "express";
import bodyParser from "body-parser";
import multer from "multer";
import pkg from 'pg';
import sharp from 'sharp';
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import path from "path";
import cors from "cors";
import fs from "fs";
import AWS from "aws-sdk";
import axios from "axios";
import { OpenAI } from "openai";
import dotenv from "dotenv";
import { fileURLToPath } from 'url';
import https from "https";
import { exec } from "child_process";
import { GoogleGenerativeAI } from "@google/generative-ai";




dotenv.config();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const { Pool } = pkg;
const openai = new OpenAI({
    apiKey: process.env.OPEN_AI_API, // Replace with your OpenAI API key
});

const AZURE_OPENAI_ENDPOINT = 'https://pulki-m5mhzt4t-australiaeast.cognitiveservices.azure.com/';
const AZURE_OPENAI_API_KEY = process.env.AZURE_OPEN_AI;
const DEPLOYMENT_NAME = 'gpt-4';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const geminiModel = genAI.getGenerativeModel({ model: "gemini-2.0-pro-exp-02-05" });


// Initialize the app and database connection
const app = express();
const port = 3000;

const sslOptions = {
    key: fs.readFileSync(path.resolve(__dirname, "privkey.pem")),
    cert: fs.readFileSync(path.resolve(__dirname, "fullchain.pem")),
};

// Enable CORS for all routes
app.use(cors());

// Middleware setup
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));


// Multer setup for file uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadPath = path.join(__dirname, 'uploads');
        if (!fs.existsSync(uploadPath)) {
            fs.mkdirSync(uploadPath, { recursive: true }); // Create directory recursively if it doesn't exist
        }
        cb(null, uploadPath);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
        cb(null, `${uniqueSuffix}-${file.originalname}`);
    },
});

// File type validation (Allow all common image MIME types including HEIC/HEIF)
const fileFilter = (req, file, cb) => {
    const allowedMimeTypes = [
        'image/jpeg', // JPG, JPEG
        'image/png',  // PNG
        'image/avif',  // GIF
        'image/bmp',  // BMP
        'image/webp', // WEBP
        'image/tiff', // TIFF
        'image/heic', // HEIC (iPhone format)
        'image/heif', // HEIF (iPhone format)
    ];
    if (allowedMimeTypes.includes(file.mimetype)) {
        cb(null, true); // Accept the file
    } else {
        cb(new Error('Only image files are allowed!'), false); // Reject the file
    }

};

// Multer middleware
const upload = multer({
    storage,
    limits: { fileSize: 10 * 1024 * 1024 }, // Limit file size to 10 MB
    fileFilter,
});

// Error handling middleware for multer
const handleMulterError = (err, req, res, next) => {
    if (err instanceof multer.MulterError) {
        // Handle Multer-specific errors
        res.status(400).json({ error: `Multer error: ${err.message}` });
    } else if (err) {
        // Handle other errors
        res.status(400).json({ error: err.message });
    } else {
        next();
    }
};

const cleanupFile = (filePath) => {
    try {
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
            console.log(`Temporary file deleted: ${filePath}`);
        }
    } catch (err) {
        console.error(`Error deleting file: ${filePath}`, err.message);
    }
};
const userOptionsStore = new Map();

// AWS S3 Setup
const s3 = new AWS.S3({
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,

});

// PostgreSQL connection pool
const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASS,
    port: 5432,
});

function imageFileToBase64(imagePath) {
    const imageData = fs.readFileSync(path.resolve(imagePath));
    return Buffer.from(imageData).toString('base64');
}

// Use this function to fetch an image from a URL and convert it to base64
async function imageUrlToBase64(imageUrl) {
    const response = await axios.get(imageUrl, { responseType: 'arraybuffer' });
    return Buffer.from(response.data, 'binary').toString('base64');
}


// Create tables
const dbSetup = async () => {
    const queries = [
        `CREATE TABLE IF NOT EXISTS users (
            id SERIAL PRIMARY KEY,
            username VARCHAR(50) NOT NULL,
            email VARCHAR(100) UNIQUE NOT NULL,
            password VARCHAR(200) NOT NULL,
            gender VARCHAR(10) not null,
            dob DATE not null,
            phone VARCHAR(10),
            profileimageurl varchar(255)          
        );`,
        `DO $$
        BEGIN
            IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'gender') THEN
                ALTER TABLE users ADD COLUMN gender VARCHAR(100);
            END IF;

            IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'dob') THEN
                ALTER TABLE users ADD COLUMN dob DATE;
            END IF;

            IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'phone') THEN
                ALTER TABLE users ADD COLUMN phone VARCHAR(10);
            END IF;
            IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'profileimageurl') THEN
                ALTER TABLE users ADD COLUMN profileimageurl VARCHAR(255);
            END IF;
        END $$;`,
        `CREATE TABLE IF NOT EXISTS outfits (
            id SERIAL PRIMARY KEY,
            user_id INT REFERENCES users(id),
            image_url VARCHAR(255) NOT NULL,
            category VARCHAR(50),
            description TEXT,
            tags TEXT,
            subcategory varchar(50)
        );`,
        `DO $$
        BEGIN
            IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'outfits' AND column_name = 'subcategory') THEN
                ALTER TABLE outfits ADD COLUMN subcategory VARCHAR(100);
            END IF;
        END $$;`,
        `CREATE TABLE IF NOT EXISTS favorites (
            id SERIAL PRIMARY KEY,
            name varchar(255),
            user_id int REFERENCES users(id) ON DELETE CASCADE,
            try_on_url TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT NOW(),
            top_id int REFERENCES outfits(id),
            bottom_id int REFERENCES outfits(id),
             suggestion TEXT,
             UNIQUE(user_id, top_id,bottom_id) -- Ensures a user can't save the same item twice
            
         );`
    ];
    for (const query of queries) {
        await pool.query(query);
    }
};

dbSetup();

// Utility functions
const generateToken = (userId) => jwt.sign({ userId }, 'your_jwt_secret', { expiresIn: '1h' });

const authenticateToken = (req, res, next) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'No token provided' });

    try {
        const decoded = jwt.verify(token, 'your_jwt_secret');
        req.userId = decoded.userId; // Attach user ID to the request object
        next();
    } catch (err) {
        res.status(401).json({ error: 'Invalid or expired token' });
    }
};

const wardrobeDetails = async (userId) => {

    const query = 'SELECT id, image_url, description,category,subcategory FROM outfits WHERE user_id = $1 ORDER BY RANDOM()';
    const values = [userId];

    const result = await pool.query(query, values);

    // Build the prompt using the fetched data
    if (result.rows.length > 0) {
        let prompt = 'Wardrobe Details:\n';
        result.rows.forEach((row, index) => {
            prompt += `Item ${row.id}\n`;
            prompt += `Category ${row.category}\n`;
            prompt += `Sub-category ${row.subcategory}\n`;
            // prompt += `   Image URL: ${row.image_url}\n`;
            prompt += `   Description: ${row.description}\n\n`;
        });
        return prompt;

    } else {
        return null;
    }
}

const generatePreferences = async (data) => {
    // Group tags by category

    const groupedData = data.reduce((acc, item) => {
        if (!acc[item.category]) {
            acc[item.category] = "";
        }
        acc[item.category] += acc[item.category] ? `, ${item.tag}` : item.tag;
        return acc;
    }, {});

    // Print all values
    var finalString = ''
    for (const [category, tags] of Object.entries(groupedData)) {
        finalString += `${category}: ${tags},`;
    }

    return finalString;

}

const fetchGenderAndDob = async (userId) => {

    const result = await pool.query(
        'select gender,dob from users where id=$1',
        [userId]
    );
    console.log(`result for user id ${userId}`, result);
    if (result.rows.length === 0) return null;

    return result.rows[0];

}

const calculateAge = async (dob) => {

    // Convert the input to a Date object
    const birthDate = new Date(dob);

    // Extract the year, month, and day from the birth date
    const birthYear = birthDate.getUTCFullYear();
    const birthMonth = birthDate.getUTCMonth(); // 0-indexed
    const birthDay = birthDate.getUTCDate();

    // Get today's date in UTC
    const today = new Date();
    const todayYear = today.getFullYear();
    const todayMonth = today.getMonth(); // 0-indexed
    const todayDay = today.getDate();

    // Calculate the age
    let age = todayYear - birthYear;

    // Adjust the age if the birthday hasn't occurred yet this year
    if (todayMonth < birthMonth || (todayMonth === birthMonth && todayDay < birthDay)) {
        age--;
    }

    return age;

}

// API Endpoints

// Signup/Register
app.post('/signup', async (req, res) => {
    const { username, email, password, phone, gender, dob } = req.body;
    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        const result = await pool.query(
            'INSERT INTO users (username, email, password,phone,gender,dob) VALUES ($1, $2, $3,$4,$5,$6) RETURNING id',
            [username, email, hashedPassword, phone, gender, dob]
        );
        res.status(201).json({ message: 'User registered successfully', userId: result.rows[0].id });
    } catch (err) {
        res.status(500).json({ error: 'User registration failed', details: err.message });
    }
});

// SignIn
app.post('/signin', async (req, res) => {
    const { email, password } = req.body;
    try {
        const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
        if (result.rows.length === 0) return res.status(401).json({ error: 'Invalid credentials' });

        const user = result.rows[0];
        const passwordMatch = await bcrypt.compare(password, user.password);
        if (!passwordMatch) return res.status(401).json({ error: 'Invalid credentials' });
        var userDataToSend = {
            "id": user.id,
            "email": user.email,
            "username": user.username,
            "gender": user.gender,
        }
        const token = generateToken(user.id);
        res.json({ message: 'Sign in successful', token, userDataToSend });
    } catch (err) {
        res.status(500).json({ error: 'Sign in failed', details: err.message });
    }
});



// Apply authentication middleware for protected routes only
app.use(authenticateToken);

app.get('/profile', async (req, res) => {
    const userId = req.userId; // Get user ID from URL params

    try {
        // Query to fetch user by ID
        const query = 'SELECT id,username,email,gender,dob,phone,profileimageurl FROM users WHERE id = $1';
        const result = await pool.query(query, [userId]);

        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'User not found' });
        }

        return res.status(200).json(result.rows[0]); // Return the first matching user
    } catch (err) {
        console.error('Error executing query:', err.message);
        return res.status(500).json({ message: 'Internal Server Error' });
    }
});

app.put('/profile', upload.single('profileimageurl'), handleMulterError, async (req, res) => {
    const userId = req.userId; // Get user ID from the request (assuming it's authenticated)
    const { username, email, phone, gender, dob, currentPassword, newPassword } = req.body;
    var profileimageurl = null;
    try {
        // Check if user exists
        const userCheckQuery = 'SELECT * FROM users WHERE id = $1';
        const userCheckResult = await pool.query(userCheckQuery, [userId]);

        if (userCheckResult.rows.length === 0) {
            return res.status(404).json({ message: 'User not found' });
        }

        // Extracted from middleware after authentication

        if (req.file) {
            //const filePath = req.file.path;
            const inputFilePath = req.file.path;
            const outputFilePath = `${inputFilePath}-converted.jpeg`;

            // Convert image to JPEG without quality degradation
            await sharp(inputFilePath)
                .jpeg({ quality: 100, chromaSubsampling: '4:4:4' }) // Maximum quality and no chroma subsampling
                .toFile(outputFilePath);
            const imageBuffer = fs.readFileSync(outputFilePath);
            const base64Image = imageBuffer.toString("base64");
            // Send request to Python API
            const apiResponse = await axios.post(
                `${process.env.API_URL}/remove-background/`,
                { image_base64: base64Image },

            );
            // Handle the API response and send base64 image back to the client
            const processedImageBase64 = apiResponse.data.image_base64;
            const processedImageBuffer = Buffer.from(processedImageBase64, "base64");


            const fileKey = `User_${userId}/ProfileImage/${Date.now()}`;



            // Define S3 upload parameters
            const params = {
                Bucket: process.env.S3_BUCKET, // Your S3 bucket name
                Key: fileKey,        // File path in S3
                Body: processedImageBuffer,  // File content
                ContentType: req.file.mimetype, // File MIME type
            };

            // Upload file to S3
            const uploadResult = await s3.upload(params).promise();
            profileimageurl = `${process.env.CLOUD_FRONT}/${fileKey}`
        }


        const user = userCheckResult.rows[0];

        // Validate current password if a new password is provided
        if (newPassword) {
            if (!currentPassword) {
                return res.status(400).json({ message: 'Current password is required to change the password.' });
            }


            const isMatch = await bcrypt.compare(currentPassword, user.password);

            if (!isMatch) {
                return res.status(400).json({ message: 'Current password is incorrect.' });
            }

            // Hash the new password
            const hashedPassword = await bcrypt.hash(newPassword, 10);

            // Update the password
            const passwordUpdateQuery = 'UPDATE users SET password = $1 WHERE id = $2';
            await pool.query(passwordUpdateQuery, [hashedPassword, userId]);
        }

        // Update other user details
        const updateQuery = `
        UPDATE users
        SET 
          username = COALESCE($1, username),
          email = COALESCE($2, email),
          phone = COALESCE($3, phone),
          gender = COALESCE($4, gender),
          dob = COALESCE($5, dob),
          profileimageurl=$7

        WHERE id = $6
        RETURNING id,username,email,gender,dob,phone,profileimageurl;
      `;
        const updateResult = await pool.query(updateQuery, [username, email, phone, gender, dob, userId, profileimageurl]);

        // Return the updated user details
        return res.status(200).json({ message: 'Profile updated successfully', user: updateResult.rows[0] });
    } catch (err) {
        console.error('Error updating profile:', err.message);
        return res.status(500).json({ message: 'Internal Server Error' });
    }
});

// File Upload
app.post('/upload', upload.single('image'), handleMulterError, async (req, res) => {
    const { category, tags, subcategory } = req.body;
    const userId = req.userId; // Extracted from middleware after authentication

    if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
    }

    try {
        //const filePath = req.file.path;
        const inputFilePath = req.file.path;
        const outputFilePath = `${inputFilePath}-converted.jpeg`;

        // Convert image to JPEG without quality degradation
        await sharp(inputFilePath)
            .jpeg({ quality: 100, chromaSubsampling: '4:4:4' }) // Maximum quality and no chroma subsampling
            .toFile(outputFilePath);

        const imageBuffer = fs.readFileSync(outputFilePath);
        const base64Image = imageBuffer.toString("base64");
        // Send request to Python API
        const apiResponse = await axios.post(
            `${process.env.API_URL}/remove-background/`,
            { image_base64: base64Image },

        );
        // Handle the API response and send base64 image back to the client
        const processedImageBase64 = apiResponse.data.image_base64;
        const processedImageBuffer = Buffer.from(processedImageBase64, "base64");

        const fileKey = `User_${userId}/${Date.now()}`;

        // Define S3 upload parameters
        const params = {
            Bucket: process.env.S3_BUCKET, // Your S3 bucket name
            Key: fileKey,
            Body: processedImageBuffer,  // File content
            ContentType: "image/png", // File MIME type
        };

        // Upload file to S3
        const uploadResult = await s3.upload(params).promise();
        var description = '';
        // Call Open Ai for description
        try {
            const response = await openai.chat.completions.create({
                model: "gpt-4o-mini", // Use the correct model for image processing
                messages: [
                    {
                        role: "user",
                        content: [
                            { type: "text", text: "Describe the clothing in the image with precise details for a stylist. Include the color, style, pattern, fabric, fit, and any standout design elements. The description should be vivid yet concise (maximum 3 lines) so that a reader can clearly visualize the garment without seeing the image." },
                            {
                                type: "image_url",
                                image_url: {
                                    url: `${process.env.CLOUD_FRONT}/${fileKey}`,
                                    detail: "low",
                                },
                            },
                        ],
                    },
                ],
                store: true,
            });
            console.log('response from api', response);
            description = response.choices[0]?.message?.content
        } catch (error) {
            console.error('Open AI API failed:', error.message);
            description = 'Description unavailable';
        }

        inputFilePath && cleanupFile(inputFilePath);
        outputFilePath && cleanupFile(outputFilePath);


        // Save metadata in the database
        const imageUrl = process.env.CLOUD_FRONT + '/' + fileKey; // S3 file URL

        const result = await pool.query(
            'INSERT INTO outfits (user_id, image_url, category,subcategory ,tags,description) VALUES ($1, $2, $3, $4,$5,$6) RETURNING id',
            [userId, imageUrl, category, subcategory, tags, description]
        );

        res.status(201).json({
            message: 'File uploaded successfully',
            outfitId: result.rows[0].id,
            imageUrl,
        });
    } catch (err) {
        // Handle errors
        console.error('Error uploading file:', err.message);
        res.status(500).json({ error: 'Failed to upload file', details: err.message });
        cleanupFile(req.file.path);

    }
});

app.get('/wardrobe-details', async (req, res) => {
    const userId = req.userId; // Extracted from middleware after authentication

    try {
        // Query to fetch wardrobe details for the given user_id
        var prompt = await wardrobeDetails(userId);
        if (prompt) {
            res.json({ prompt });
        } else {
            res.status(404).json({ error: 'Wardrobe details not found' });
        }

    } catch (err) {
        console.error('Error fetching wardrobe details:', err);
        res.status(500).json({ error: 'Failed to fetch wardrobe details', details: err.message });
    }
});

// Wardrobe Organizer
app.get('/wardrobe', async (req, res) => {
    const userId = req.userId; // Extracted from middleware after authentication
    try {
        const result = await pool.query(
            `
            SELECT * 
            FROM outfits 
            WHERE user_id = $1 
            ORDER BY 
                CASE 
                    WHEN category = 'Tops' THEN 1
                    WHEN category = 'Bottoms' THEN 2
                    WHEN category = 'Shoes' THEN 3
                    ELSE 4 
                END, 
                category
            `,
            [userId]
        );
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch wardrobe', details: err.message });
    }
});

app.get('/outfits/:id', async (req, res) => {
    const { id } = req.params;
    const userId = req.userId; // Extracted from middleware after authentication

    try {
        const result = await pool.query(
            'SELECT * FROM outfits WHERE id = $1 AND user_id = $2',
            [id, userId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Outfit not found or unauthorized' });
        }

        res.json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch outfit', details: err.message });
    }
});


// Edit Outfit
app.put('/outfits/:id', async (req, res) => {
    const { id } = req.params;
    const { category, tags, description, subcategory } = req.body;
    const userId = req.userId; // Extracted from middleware after authentication

    try {
        const result = await pool.query(
            'UPDATE outfits SET category = $1, tags = $2 ,description= $5,subcategory=$6 WHERE id = $3 AND user_id = $4 RETURNING id',
            [category, tags, id, userId, description, subcategory]
        );
        if (result.rows.length === 0) return res.status(404).json({ error: 'Outfit not found or unauthorized' });

        res.json({ message: 'Outfit updated successfully', outfitId: result.rows[0].id });
    } catch (err) {
        res.status(500).json({ error: 'Failed to update outfit', details: err.message });
    }
});

app.delete('/outfits/:id', async (req, res) => {
    const { id } = req.params;
    const userId = req.userId; // Extracted from middleware after authentication

    try {
        // Retrieve the outfit details
        const outfitResult = await pool.query(
            'SELECT image_url FROM outfits WHERE id = $1 AND user_id = $2',
            [id, userId]
        );

        if (outfitResult.rows.length === 0) {
            return res.status(404).json({ error: 'Outfit not found or unauthorized' });
        }

        const imageUrl = outfitResult.rows[0].image_url;

        // Extract the file key from the image URL
        const fileKey = imageUrl.replace(process.env.CLOUD_FRONT, '');

        // Delete the file from S3
        await s3.deleteObject({
            Bucket: process.env.S3_BUCKET,
            Key: fileKey,
        }).promise();

        // Delete the outfit record from the database
        await pool.query('DELETE FROM outfits WHERE id = $1 AND user_id = $2', [id, userId]);

        res.json({ message: 'Outfit deleted successfully' });
    } catch (err) {

        res.status(500).json({ error: 'Failed to delete outfit', details: err.message });
    }
});

app.post('/ootd', async (req, res) => {
    const userId = req.userId; // Extracted from middleware after authentication

    let userOptions = userOptionsStore.get(userId) || {};

    if (!Array.isArray(userOptions)) {
        userOptions = [];
    }

    // Include existing options in the prompt
    const optionsAsText = userOptions
        .map((option, index) => `Option ${index + 1}: ${JSON.stringify(option)}`)
        .join('\n');

    // Clear the user's data from the Map after processing
    userOptionsStore.delete(userId);
    userOptions.shift();

    var clothData = await wardrobeDetails(userId);
    var preferences = await generatePreferences(req.body);
    var userGenderAndDobData = await fetchGenderAndDob(req.userId);
    var usergender, userDob, userAge;
    if (userGenderAndDobData) {
        usergender = userGenderAndDobData.gender;
        userDob = userGenderAndDobData.dob;
        userAge = await calculateAge(userDob);

    }

    var promptToSent =
        clothData +
        `\nTask:Hi i am a ${usergender}, Age ${userAge}. Based on the provided wardrobe consider categories and sub-categories as description might not tell correct category of cloth , randomly select clothes and suggest multiple outfit options for the given preferences:\n`
        + preferences +
        `\nResponse Format: Provide at least two options. Strictly follow the below following format:
        - OUTFIT OPTION 1:
            - Top: Give only Item number(e.g., Item 17)
            - Bottom: Give only Item number(e.g., Item 19)
            - Layering: Give only Item number. Give suggestions if Mentioned yes in Given preferences else ignore dont show in response.
            - Accessories: Give suggestions if suitable item not available for this category else Give only item number.
            - Footwear: Give suggestions if suitable item not available for this category else Give only item number.
            - Styling suggestions: Suggestion to style this outfit option.
        - OUTFIT OPTION 2:
            - Top: Give only Item number
            - Bottom: Give only Item number
            - Layering: Give only Item number. Give suggestions if Mentioned yes in Given preferences else ignore dont show in response.
            - Accessories: Give suggestions if suitable item not available for this category else Give only item number.
            - Footwear: Give suggestions if suitable item not available for this category else Give only item number.
            - Styling suggestions: Suggestion to style this outfit option.
        Ensure all components reference the corresponding Item numbers where applicable.Each outfit should be unique also make sure color palette of outfit matches and tailored to the given preferences and add layered items in options if mentioned in preferences. Already suggested options from you:\n${optionsAsText} Lets avoid pairing them again`;
    console.log('promptToSent:', promptToSent);
    try {

        // const response = await axios.post(
        //     `${AZURE_OPENAI_ENDPOINT}openai/deployments/${DEPLOYMENT_NAME}/chat/completions?api-version=2024-08-01-preview`,
        //     {
        //         messages: [
        //             { role: 'system', content: 'You are a friendly fashion expert specializing in generating outfit suggestions based on provided clothing descriptions.' },
        //             { role: 'user', content: promptToSent }
        //         ],
        //         max_tokens: 300,
        //         temperature: 0.7
        //     },
        //     {
        //         headers: {
        //             'Content-Type': 'application/json',
        //             'api-key': AZURE_OPENAI_API_KEY
        //         }
        //     }
        // );

        // const response = await openai.chat.completions.create({
        //     model: "gpt-4o-mini",
        //     messages: [
        //         {
        //             role: "system",
        //             content: "You are a friendly fashion expert specializing in generating outfit suggestions based on provided clothing descriptions.",
        //         },
        //         {
        //             role: "user",
        //             content: promptToSent,
        //         },
        //     ],
        //     max_tokens: 300,
        //     temperature: 0.7,
        // });

        const geminiResp = await geminiModel.generateContent({
            contents: [
                {
                  role: 'user',
                  parts: [
                    {
                      text: promptToSent,
                    }
                  ],
                }
            ],
            generationConfig: {
              maxOutputTokens: 300,
              temperature: 0.7,
            }
        });

        // var result = response.choices[0].message.content.trim();
        var result=geminiResp.response.text().trim();
        console.log('result:', result);
        const options = {};
        const sections = result.split(/OUTFIT OPTION \d+:?/gi); // Split by "OUTFIT OPTION X"

        sections.forEach((section, index) => {
            if (index === 0) return; // Skip the intro part

            const optionKey = `Option ${index}`;
            options[optionKey] = []; // Initialize array for this option

            // Match lines like "Top: Item 18" or "Accessories: Some suggestion here"
            const matches = [...section.matchAll(/(\w+):\s*(Item\s(\d+))?(.*?)(?=\n|$)/gi)];
            matches.forEach(match => {
                const key = match[1]; // The part before the colon, e.g., "Top", "Bottom", etc.
                const clothId = match[3] || null; // Capture Item number if present
                const suggestion = match[4] ? match[4] : null; // If Item exists, no suggestion
                options[optionKey].push({
                    key,
                    clothId,
                    suggestion,
                });
            });
        });

        console.log('Parsed options:', options);

        console.log('userOptionsStore:', userOptionsStore);
        console.log('userOptions:', userOptions);
        // Add the new options to the user's queue
        userOptions.push(options);

        // If the count exceeds 2, remove the oldest entry
        if (userOptions.length > 1) {
            userOptions.shift(); // Remove the oldest entry
        }

        // Save the updated options back to the Map
        userOptionsStore.set(userId, userOptions);


        var resp = await updateOptionsWithUrls(options)
            .then(updatedOptions => {
                return updatedOptions;
            })
            .catch(error => {
                console.error("Error:", error);
            });

        res.json(resp);
    } catch (error) {
        console.error("Error with OpenAI API:", error);
        throw error;
    }
});

app.post('/AddToFavorites', async (req, res) => {
    try {
        const { top, bottom, vtonimage, suggestion,name } = req.body;
        const userId = req.userId;
        //upload vtonimage to s3 and extract the url and save to db
        const base64Data = Buffer.from(vtonimage, "base64");
        

        const fileKey = `User_${userId}/${Date.now()}`;

        // Define S3 upload parameters
        const params = {
            Bucket: process.env.S3_BUCKET, // Your S3 bucket name
            Key: fileKey,
            Body: base64Data,  // File content
            ContentType: `image/jpeg`, // File MIME type
        };

        // Upload file to S3
        const uploadResult = await s3.upload(params).promise();
        const try_on_url = `${process.env.CLOUD_FRONT}/${fileKey}`

        // Insert into database
        const result = await pool.query(
            `INSERT INTO favorites (user_id, top_id, bottom_id, try_on_url, suggestion,name)
             VALUES ($1, $2, $3, $4, $5,$6) 
             ON CONFLICT (user_id, top_id, bottom_id) DO NOTHING 
             RETURNING *`,
            [userId, top, bottom, try_on_url, suggestion,name]
        );

        if (result.rowCount === 0) {
            return res.status(409).json({ message: "Item already in favorites" });
        }

        res.status(201).json({ message: "Item added to favorites", try_on_url });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Server error" });
    }
});

app.get('/favorites', async (req, res) => {
    try {
        const user_id = req.userId;
        const result = await pool.query(
            `SELECT 
                f.id AS favorite_id,
                f.user_id,
                f.try_on_url,
                f.created_at,
                f.suggestion,
                f.name,
                top_outfit.id AS top_id,
                top_outfit.image_url AS top_image_url,
                top_outfit.category AS top_category,
                top_outfit.description AS top_description,
                top_outfit.tags AS top_tags,
                top_outfit.subcategory AS top_subcategory,

                bottom_outfit.id AS bottom_id,
                bottom_outfit.image_url AS bottom_image_url,
                bottom_outfit.category AS bottom_category,
                bottom_outfit.description AS bottom_description,
                bottom_outfit.tags AS bottom_tags,
                bottom_outfit.subcategory AS bottom_subcategory

            FROM favorites f
            LEFT JOIN outfits top_outfit ON f.top_id = top_outfit.id
            LEFT JOIN outfits bottom_outfit ON f.bottom_id = bottom_outfit.id
            WHERE f.user_id = $1`,
            [user_id]
        );
        const formattedData = result.rows.map(row => ({
            favorite_id: row.favorite_id,
            user_id: row.user_id,
            try_on_url: row.try_on_url,
            created_at: row.created_at,
            suggestion: row.suggestion,
            name:row.name,
            top: {
                id: row.top_id,
                image_url: row.top_image_url,
                category: row.top_category,
                description: row.top_description,
                tags: row.top_tags,
                subcategory: row.top_subcategory
            },
            bottom: {
                id: row.bottom_id,
                image_url: row.bottom_image_url,
                category: row.bottom_category,
                description: row.bottom_description,
                tags: row.bottom_tags,
                subcategory: row.bottom_subcategory
            }
        }));
        res.json(formattedData);

    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Server error" });
    }
})

app.post('/virtualtryon', async (req, res) => {
    const userId = req.userId;
    const userCheckQuery = 'SELECT gender,profileimageurl FROM users WHERE id = $1';
    const userCheckResult = await pool.query(userCheckQuery, [userId]);
    var defaultImageurl = '';
    if (!userCheckResult.rows[0].profileimageurl) {
        if (userCheckResult.rows[0].gender == 'male') {
            defaultImageurl = 'https://levihsu-ootdiffusion.hf.space/file=/tmp/gradio/ba5ba7978e7302e8ab5eb733cc7221394c4e6faf/model_5.png'
        }
        else {
            defaultImageurl = 'https://levihsu-ootdiffusion.hf.space/file=/tmp/gradio/2e0cca23e744c036b3905c4b6167371632942e1c/model_1.png'
        }
    }
    else {
        defaultImageurl = userCheckResult.rows[0].profileimageurl;
    }

    const response_0 = await fetch(defaultImageurl);
    const userImage = await response_0.blob();

    // List of API keys
    const apiKeys = [
        "SG_06b81cb55697b898",
        "SG_5fdfae34f7a9684d"
    ];

    // Function to get a random API key
    function getRandomApiKey() {
        return apiKeys[Math.floor(Math.random() * apiKeys.length)];
    }

    // Choose an API key (randomly or use the single one if there's only one)
    const apiKey = apiKeys.length === 1 ? apiKeys[0] : getRandomApiKey();
    const url = "https://api.segmind.com/v1/try-on-diffusion";



    const data = {
        "model_image": await imageUrlToBase64(defaultImageurl),  // Or use imageFileToBase64("IMAGE_PATH")
        "cloth_image": await imageUrlToBase64(req.body.bottom),  // Or use imageFileToBase64("IMAGE_PATH")
        "category": "Lower body",
        "num_inference_steps": 35,
        "guidance_scale": 2,
        "seed": Math.floor(Math.random() * 5000000) + 1,
        "base64": true

    };

    try {
        const result = await axios.post(url, data, { headers: { 'x-api-key': apiKey } });


        const finalData = {
            "model_image": result.data.image,  // Or use imageFileToBase64("IMAGE_PATH")
            "cloth_image": await imageUrlToBase64(req.body.top),  // Or use imageFileToBase64("IMAGE_PATH")
            "category": "Upper body",
            "num_inference_steps": 35,
            "guidance_scale": 2,
            "seed": Math.floor(Math.random() * 5000000) + 1,
            "base64": true

        }

        const finalResponse = await axios.post(url, finalData, { headers: { 'x-api-key': apiKey } });


        res.json({
            "output": finalResponse.data.image
        });
    } catch (error) {
        console.error('Error:', error.response ? error.response.data : error.message);
        res.status(500).json({ error: 'Failed to process the request' });
    }
});

app.delete('/removeFavorites/:id', async (req, res) => {
    try {
        
        const user_id = req.userId;
        const fav_id=req.params.id

        const result = await pool.query(
            "DELETE FROM favorites WHERE user_id = $1 AND favorites.id = $2 RETURNING *",
            [user_id, fav_id]
        );

        if (result.rowCount === 0) {
            return res.status(404).json({ message: "Item not found in favorites" });
        }

        res.json({ message: "Item removed from favorites" });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Server error" });
    }
})

const updateOptionsWithUrls = async (options) => {
    try {
        // Extract all cloth IDs from the options object
        const clothIds = [...new Set(
            Object.values(options).flatMap(option => option.map(item => item.clothId))
        )];

        // Fetch corresponding records from the database
        const query = `
            SELECT id, image_url,category,subcategory,tags 
            FROM outfits 
            WHERE id = ANY($1)
        `;
        const res = await pool.query(query, [clothIds]);

        // Create a mapping of cloth IDs to image URLs
        const clothDatabase = res.rows.reduce((acc, record) => {
            acc[record.id] = record
            return acc;
        }, {});

        // Update the `options` object by replacing `clothId` with the image URL
        Object.keys(options).forEach(optionKey => {
            options[optionKey] = options[optionKey].map(item => ({
                ...item,
                clothId: clothDatabase[item.clothId] || item.clothId // Replace with URL or keep original ID if not found
            }));
        });
        // Extract item numbers mentioned in suggestions
        // Function to extract all "Item X" IDs from suggestions
        const extractItemIdsFromSuggestions = (options) => {
            const itemIds = new Set();
            Object.values(options).forEach(option =>
                option.forEach(item => {
                    if (item.key === 'suggestions' && item.suggestion) {
                        const matches = [...item.suggestion.matchAll(/Item\s(\d+)/g)];
                        matches.forEach(match => itemIds.add(parseInt(match[1], 10))); // Add matched item IDs
                    }
                })
            );
            return [...itemIds]; // Return unique item IDs
        };

        // Extract item IDs from suggestions
        const itemIds = extractItemIdsFromSuggestions(options);

        // Fetch item data for the extracted item IDs
        const queryNew = `
            SELECT id, tags
            FROM outfits 
            WHERE id = ANY($1)
        `;
        const resp = await pool.query(queryNew, [itemIds]);

        // Create a mapping of item IDs to their tags and details
        const itemDetails = resp.rows.reduce((acc, record) => {
            acc[record.id] = record.tags || `Item ${record.id}`; // Use tags if available; otherwise keep "Item X"
            return acc;
        }, {});

        // Replace "Item X" in suggestions with the fetched tags
        Object.keys(options).forEach(optionKey => {
            options[optionKey].forEach(item => {
                if (item.key === 'suggestions' && item.suggestion) {
                    // Replace all occurrences of "Item X" with the corresponding tag or name
                    item.suggestion = item.suggestion.replace(/Item\s(\d+)/g, (match, itemId) => {
                        return itemDetails[itemId] || match; // Replace with tag or keep original if not found
                    });
                }
            });
        });

        return options;
    } catch (error) {
        console.error("Error fetching data from database:", error);
        throw error;
    }
};

function saveBase64AsImage(base64Data, filePath) {
    const base64Image = base64Data.split(';base64,').pop(); // Remove metadata, if present
    fs.writeFileSync(filePath, base64Image, { encoding: 'base64' });

}

const httpsServer = https.createServer(sslOptions, app);


httpsServer.listen(port, () => {
    console.log(`HTTPS server running on https://localhost:${port}`);
});
