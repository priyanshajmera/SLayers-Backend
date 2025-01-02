// Import necessary modules
const express = require('express');
const bodyParser = require('body-parser');
const multer = require('multer');
const { Pool } = require('pg');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const path = require('path');
const cors = require('cors');
const fs = require('fs');
const AWS = require('aws-sdk');
const axios = require('axios');
const { spawn } = require('child_process');

const { OpenAI } = require("openai");



require('dotenv').config();

const openai = new OpenAI({
    apiKey: process.env.OPEN_AI_API, // Replace with your OpenAI API key
});

// Initialize the app and database connection
const app = express();
const port = 3000;

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
            fs.mkdirSync(uploadPath);
        }
        cb(null, uploadPath);
    },
    filename: (req, file, cb) => {
        cb(null, `${Date.now()}-${file.originalname}`);
    },
});
const upload = multer({ storage });

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


// Create tables
const dbSetup = async () => {
    const queries = [
        `CREATE TABLE IF NOT EXISTS users (
            id SERIAL PRIMARY KEY,
            username VARCHAR(50) NOT NULL,
            email VARCHAR(100) UNIQUE NOT NULL,
            password VARCHAR(200) NOT NULL
        );`,
        `CREATE TABLE IF NOT EXISTS outfits (
            id SERIAL PRIMARY KEY,
            user_id INT REFERENCES users(id),
            image_url VARCHAR(255) NOT NULL,
            category VARCHAR(50),
            description TEXT,
            tags TEXT
        );`,
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

    const query = 'SELECT id, image_url, description FROM outfits WHERE user_id = $1';
    const values = [userId];

    const result = await pool.query(query, values);

    // Build the prompt using the fetched data
    if (result.rows.length > 0) {
        let prompt = 'You Are A Fashion Expert And You have to suggest outfit for today from my wardorbe.These are my clothes in my wardrobe:\n\n';
        result.rows.forEach((row, index) => {
            prompt += `Cloth ${row.id}\n`;
            prompt += `   Image URL: ${row.image_url}\n`;
            prompt += `   Description: ${row.description}\n\n`;
        });
        return prompt;

    } else {
        return null;
    }
}

const generatePrompt = async (data) => {
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

// API Endpoints

// Signup/Register
app.post('/signup', async (req, res) => {
    const { username, email, password } = req.body;
    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        const result = await pool.query(
            'INSERT INTO users (username, email, password) VALUES ($1, $2, $3) RETURNING id',
            [username, email, hashedPassword]
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

        const token = generateToken(user.id);
        res.json({ message: 'Sign in successful', token });
    } catch (err) {
        res.status(500).json({ error: 'Sign in failed', details: err.message });
    }
});

// Apply authentication middleware for protected routes only
app.use(authenticateToken);

// File Upload
app.post('/upload', upload.single('image'), async (req, res) => {
    const { category, tags } = req.body;
    const userId = req.userId; // Extracted from middleware after authentication

    if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
    }

    try {
        // Generate unique file path in S3
        const fileKey = `User_${userId}/${Date.now()}`;

        // Read the uploaded file from the local file system
        const fileContent = fs.readFileSync(req.file.path);

        // Define S3 upload parameters
        const params = {
            Bucket: 'wardrobess', // Your S3 bucket name
            Key: fileKey,        // File path in S3
            Body: fileContent,   // File content
            ContentType: req.file.mimetype, // File MIME type
        };

        // Upload file to S3
        const uploadResult = await s3.upload(params).promise();
        var description = '';
        // Call Flask API to process the image
        try {
            const flaskResponse = await axios.post(`${process.env.API_URL}/process-image`, {
                image_url: `https://d26666n82ym1ga.cloudfront.net/${fileKey}`,
            });

            description = flaskResponse.data.caption;
        }
        catch (flaskError) {
            console.error('Flask API failed:', flaskError.message);
            description = 'Description unavailable'; // Default value in case of failure
        }


        cleanupFile(req.file.path);



        // // Delete the file from the local file system after uploading to S3
        // fs.unlinkSync(req.file.path);

        // Save metadata in the database
        const imageUrl = "https://d26666n82ym1ga.cloudfront.net/" + fileKey; // S3 file URL

        const result = await pool.query(
            'INSERT INTO outfits (user_id, image_url, category, tags,description) VALUES ($1, $2, $3, $4,$5) RETURNING id',
            [userId, imageUrl, category, tags, description]
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
    const { category, tags } = req.body;
    const userId = req.userId; // Extracted from middleware after authentication

    try {
        const result = await pool.query(
            'UPDATE outfits SET category = $1, tags = $2 WHERE id = $3 AND user_id = $4 RETURNING id',
            [category, tags, id, userId]
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
        const fileKey = imageUrl.replace('https://d26666n82ym1ga.cloudfront.net/', '');

        // Delete the file from S3
        await s3.deleteObject({
            Bucket: 'wardrobess',
            Key: fileKey,
        }).promise();

        // Delete the outfit record from the database
        await pool.query('DELETE FROM outfits WHERE id = $1 AND user_id = $2', [id, userId]);

        res.json({ message: 'Outfit deleted successfully' });
    } catch (err) {
        console.error('Error deleting outfit:', err.message);
        res.status(500).json({ error: 'Failed to delete outfit', details: err.message });
    }
});

app.post('/ootd', async (req, res) => {
    const userId = req.userId; // Extracted from middleware after authentication

    var clothData = await wardrobeDetails(userId);
    var prompt = await generatePrompt(req.body);
    var promptToSent = clothData + '\nMy preference are as follows ' + prompt;
    try {
        const response = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
                {
                    role: "system",
                    content: "You are a helpful assistant that creates suggestions based on user preferences.",
                },
                {
                    role: "user",
                    content: promptToSent,
                },
            ],
            max_tokens: 300,
            temperature: 0.7,
        });

        var result = response.choices[0].message.content.trim();
        console.log('openai resule:', result);
        const options = {};
        const sections = result.split("### Outfit Option"); // Split by outfit options
        sections.forEach((section, index) => {
            if (index === 0) return; // Skip the intro part
            const optionKey = `Option ${index}`;
            const matches = [...section.matchAll(/-\s\*\*(.*?)\*\*.*?\(Cloth (\d+)\)/g)];
            options[optionKey] = matches.map(match => ({
                key: match[1], // Key enclosed in **
                clothId: match[2], // Extracted cloth ID
            }));
        });
        console.log('options:', options);

        var resp = await updateOptionsWithUrls(options)
            .then(updatedOptions => {
                return updatedOptions;
            })
            .catch(error => {
                console.error("Error:", error);
            });
        console.log('final:', resp);
        res.json(resp);
    } catch (error) {
        console.error("Error with OpenAI API:", error);
        throw error;
    }
});

const updateOptionsWithUrls = async (options) => {
    try {
        // Extract all cloth IDs from the options object
        const clothIds = [...new Set(
            Object.values(options).flatMap(option => option.map(item => item.clothId))
        )];

        // Fetch corresponding records from the database
        const query = `
            SELECT id, image_url 
            FROM outfits 
            WHERE id = ANY($1)
        `;
        const res = await pool.query(query, [clothIds]);

        // Create a mapping of cloth IDs to image URLs
        const clothDatabase = res.rows.reduce((acc, record) => {
            acc[record.id] = record.image_url;
            return acc;
        }, {});

        // Update the `options` object by replacing `clothId` with the image URL
        Object.keys(options).forEach(optionKey => {
            options[optionKey] = options[optionKey].map(item => ({
                ...item,
                clothId: clothDatabase[item.clothId] || item.clothId // Replace with URL or keep original ID if not found
            }));
        });

        return options;
    } catch (error) {
        console.error("Error fetching data from database:", error);
        throw error;
    }
};

// app.post('/test', async (req, res) => {
//     var result = req.body.data;
//     console.log('result:', result)
//     const options = {};
//     const sections = result.split("### Outfit Option"); // Split by outfit options
//     sections.forEach((section, index) => {
//         if (index === 0) return; // Skip the intro part
//         const optionKey = `Option ${index}`;
//         const matches = [...section.matchAll(/-\s\*\*(.*?)\*\*.*?\(Cloth (\d+)\)/g)];
//         options[optionKey] = matches.map(match => ({
//             key: match[1], // Key enclosed in **
//             clothId: match[2], // Extracted cloth ID
//         }));
//     });
//     console.log('options:', options)
//     var response = await updateOptionsWithUrls(options)
//         .then(updatedOptions => {
//             return updatedOptions;
//         })
//         .catch(error => {
//             console.error("Error:", error);
//         });

//     res.json(response);
// });

// Start server
app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});
