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
import { spawn } from "child_process";
import { Client } from "@gradio/client";
import { OpenAI } from "openai";
import dotenv from "dotenv";
import { fileURLToPath } from 'url';

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
        END $$;`
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

    const query = 'SELECT id, image_url, description,category,subcategory FROM outfits WHERE user_id = $1';
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

app.put('/profile', upload.single('profileimageurl'), async (req, res) => {
    const userId = req.userId; // Get user ID from the request (assuming it's authenticated)
    const { username, email, phone, gender, dob, currentPassword, newPassword } = req.body;
    var profileimageurl=null;
    try {
        // Check if user exists
        const userCheckQuery = 'SELECT * FROM users WHERE id = $1';
        const userCheckResult = await pool.query(userCheckQuery, [userId]);

        if (userCheckResult.rows.length === 0) {
            return res.status(404).json({ message: 'User not found' });
        }

         // Extracted from middleware after authentication

        if (req.file) {
            const filePath = req.file.path;

            const imageBuffer = fs.readFileSync(filePath);
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
                Bucket: 'wardrobess', // Your S3 bucket name
                Key: fileKey,        // File path in S3
                Body: processedImageBuffer,  // File content
                ContentType: req.file.mimetype, // File MIME type
            };

            // Upload file to S3
            const uploadResult = await s3.upload(params).promise();
            profileimageurl = `https://d26666n82ym1ga.cloudfront.net/${fileKey}`
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
          profileimageurl=COALESCE($7, profileimageurl)

        WHERE id = $6
        RETURNING id,username,email,gender,dob,phone,profileimageurl;
      `;
        const updateResult = await pool.query(updateQuery, [username, email, phone, gender, dob, userId,profileimageurl]);

        // Return the updated user details
        return res.status(200).json({ message: 'Profile updated successfully', user: updateResult.rows[0] });
    } catch (err) {
        console.error('Error updating profile:', err.message);
        return res.status(500).json({ message: 'Internal Server Error' });
    }
});

// File Upload
app.post('/upload', upload.single('image'), async (req, res) => {
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
            Bucket: 'wardrobess', // Your S3 bucket name
            Key: fileKey,        // File path in S3
            Body: processedImageBuffer,  // File content
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

        res.status(500).json({ error: 'Failed to delete outfit', details: err.message });
    }
});

app.post('/ootd', async (req, res) => {
    const userId = req.userId; // Extracted from middleware after authentication

    var clothData = await wardrobeDetails(userId);
    var preferences = await generatePreferences(req.body);
    var promptToSent =
        clothData +
        '\nTask: Based on the provided wardrobe, suggest multiple outfit options for the given preferences:\n'
        + preferences +
        `\nResponse Format: Provide at least two options in the following format:
        - OUTFIT OPTION 1:
            - Top: Item number(e.g., Item 17)
            - Bottom: Item number(e.g., Item 19)
            - Layered(Only Mentioned in Given preferences):Item number(e.g., Item 21)
            - Accessories / Footwear: Suggestions for accessories and footwear.
        - OUTFIT OPTION 2:
            - Top: Item number
            - Bottom: Item number
            - Layered(Only Mentioned in Given preferences):Item number(e.g., Item 21)
            - Accessories / Footwear: Suggestions for accessories and footwear.  
        Ensure all components reference the corresponding Item numbers where applicable.Each outfit should be unique and tailored to the given preferences add layered items in options if mentioned in preferences.`;
    console.log('promptToSent:', promptToSent);
    try {

        const response = await axios.post(
            `${AZURE_OPENAI_ENDPOINT}openai/deployments/${DEPLOYMENT_NAME}/chat/completions?api-version=2024-08-01-preview`,
            {
                messages: [
                    { role: 'system', content: 'You are a friendly fashion expert specializing in generating outfit suggestions based on provided clothing descriptions.' },
                    { role: 'user', content: promptToSent }
                ],
                max_tokens: 300,
                temperature: 0.7
            },
            {
                headers: {
                    'Content-Type': 'application/json',
                    'api-key': AZURE_OPENAI_API_KEY
                }
            }
        );

        // const response = await openai.chat.completions.create({
        //     model: "gpt-4o-mini",
        //     messages: [
        //         {
        //             role: "system",
        //             content: "You are a helpful assistant that creates suggestions based on user preferences.",
        //         },
        //         {
        //             role: "user",
        //             content: promptToSent,
        //         },
        //     ],
        //     max_tokens: 300,
        //     temperature: 0.7,
        // });

        var result = response.data.choices[0].message.content.trim();
        console.log('result:', result);
        const options = {};
        const sections = result.split(/OUTFIT OPTION \d+:?/gi); // Split by "Outfit Option X"
        console.log('sections:', sections);
        sections.forEach((section, index) => {
            if (index === 0) return; // Skip the intro part
            const optionKey = `Option ${index} `;

            // Regex to match parts like Top, Bottom, Accessories with Cloth ID
            const matches = [...section.matchAll(/(\w+):?.*?Item\s(\d+)/gi)];
            options[optionKey] = matches.map(match => ({
                key: match[1], // Captures "Top", "Bottom", "Accessories", etc.
                clothId: match[2], // Captures the cloth number
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

        res.json(resp);
    } catch (error) {
        console.error("Error with OpenAI API:", error);
        throw error;
    }
});

app.post('/virtualtryon', async (req, res) => {
    const userId=req.userId;
    const userCheckQuery = 'SELECT gender,profileimageurl FROM users WHERE id = $1';
    const userCheckResult = await pool.query(userCheckQuery, [userId]);
    var defaultImageurl='';
    if(!userCheckResult.rows[0].profileimageurl){
        if(userCheckResult.rows[0].gender=='male'){
            defaultImageurl='https://levihsu-ootdiffusion.hf.space/file=/tmp/gradio/ba5ba7978e7302e8ab5eb733cc7221394c4e6faf/model_5.png'
        }
        else{
            defaultImageurl=-'https://levihsu-ootdiffusion.hf.space/file=/tmp/gradio/2e0cca23e744c036b3905c4b6167371632942e1c/model_1.png'
        }
    }
    else{
        defaultImageurl=userCheckResult.rows[0].profileimageurl;
    }
    //now we have to fetch the user image from user id that s3 url will go below
    const response_0 = await fetch(defaultImageurl);
    const userImage = await response_0.blob();

    try {
        // Connect to the client

        const client = await Client.connect(process.env.GRADIO_API_KEY);


        const response_2 = await fetch(req.body.bottom);
        const bottom = await response_2.blob();

        const bottomOutput = await client.predict("/process_dc", {
            vton_img: userImage,
            garm_img: bottom,
            category: "Lower-body",
            n_samples: 1,
            n_steps: 30,
            image_scale: 2.2,
            seed: -1,
        });

        const response_1 = await fetch(req.body.top);
        const topImage = await response_1.blob();
        const bottomImage = await fetch(bottomOutput.data[0][0].image.url);
        const bottomBlob = await bottomImage.blob();
        // Make the API request and wait for the result
        const result = await client.predict("/process_dc", {
            vton_img: bottomBlob,
            garm_img: topImage,
            category: "Upper-body",
            n_samples: 1,
            n_steps: 30,
            image_scale: 2.2,
            seed: -1,
        });

        console.log('result:', result.data[0][0].image.url);

        // Return the response
        res.json({
            "top": req.body.top,
            "bottom": req.body.bottom,
            "output": result.data[0][0].image.url
        });
    } catch (error) {
        // Handle errors gracefully
        console.error('Error during API call:', error);
        res.status(500).json({ error: 'Failed to process the request' });
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



// Start server
app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});
