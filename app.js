const express = require('express');
const cors = require('cors');
const connectDB = require('./config/database');
const swaggerUi = require('swagger-ui-express');
const swaggerSpec = require('./config/swagger');
const userRoutes = require('./route/userRoute');

const app = express();
const PORT = process.env.PORT || 3000;
const configuredOrigins = process.env.CORS_ORIGIN
    ? process.env.CORS_ORIGIN.split(',').map(origin => origin.trim()).filter(Boolean)
    : [];

app.use(express.json());
app.use(cors({
    origin: (requestOrigin, callback) => {
        if (!requestOrigin || configuredOrigins.includes(requestOrigin) || /^https:\/\/[a-z0-9-]+\.vercel\.app$/i.test(requestOrigin)) {
            return callback(null, true);
        }

        return callback(new Error('Origin is not allowed by CORS'));
    },
    methods: ['GET', 'POST', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    optionsSuccessStatus: 204
}));
app.use('/api', userRoutes);
app.get('/api-docs.json', (req, res) => {
    res.json(swaggerSpec);
});
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

app.get('/', (req, res) => {
    res.redirect('/api-docs');
});

async function startServer() {
    await connectDB();

    app.listen(PORT, () => {
        console.log(`Server listening on http://localhost:${PORT}`);
        console.log(`Swagger documentation available at http://localhost:${PORT}/api-docs`);
    });
}

startServer().catch(error => {
    console.error('Application startup failed:', error.message);
    process.exit(1);
});