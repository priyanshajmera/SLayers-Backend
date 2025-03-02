import jwt from 'jsonwebtoken';

export const generateToken = (userId) => jwt.sign({ userId }, 'your_jwt_secret', { expiresIn: '1h' });

export const authenticateToken = (req, res, next) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'No token provided' });

    try {
        const decoded = jwt.verify(token, 'your_jwt_secret');
        req.userId = decoded.userId;
        next();
    } catch (err) {
        res.status(401).json({ error: 'Invalid or expired token' });
    }
}; 