import pkg from 'pg';
import dotenv from 'dotenv';

dotenv.config();
const { Pool } = pkg;

// PostgreSQL connection pool
const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASS,
    port: 5432,
});

// Database setup function
export const dbSetup = async () => {
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
            UNIQUE(user_id, top_id,bottom_id)
        );`
    ];

    for (const query of queries) {
        await pool.query(query);
    }
};

export default pool; 