import express from 'express';
import bcrypt from 'bcrypt';
import pool from '../config/database.js';
import { generateToken } from '../middleware/auth.js';

const router = express.Router();

// Signup/Register
router.post('/signup', async (req, res) => {
    const { username, email, password, phone, gender, dob } = req.body;
    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        const result = await pool.query(
            'INSERT INTO users (username, email, password, phone, gender, dob) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id',
            [username, email, hashedPassword, phone, gender, dob]
        );
        res.status(201).json({ message: 'User registered successfully', userId: result.rows[0].id });
    } catch (err) {
        res.status(500).json({ error: 'User registration failed', details: err.message });
    }
});

// SignIn
router.post('/signin', async (req, res) => {
    const { email, password } = req.body;
    try {
        const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
        if (result.rows.length === 0) return res.status(401).json({ error: 'Invalid credentials' });

        const user = result.rows[0];
        const passwordMatch = await bcrypt.compare(password, user.password);
        if (!passwordMatch) return res.status(401).json({ error: 'Invalid credentials' });

        const userDataToSend = {
            "id": user.id,
            "email": user.email,
            "username": user.username,
            "gender": user.gender,
        };
        const token = generateToken(user.id);
        res.json({ message: 'Sign in successful', token, userDataToSend });
    } catch (err) {
        res.status(500).json({ error: 'Sign in failed', details: err.message });
    }
});

export default router; 