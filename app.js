const express = require('express');
const cors = require('cors');
const connectDB = require('./config/database');
const swaggerUi = require('swagger-ui-express');
const swaggerSpec = require('./config/swagger');
const userRoutes = require('./route/userRoute');
const bankRoutes = require('./route/bankRoute');
const payrollRoutes = require('./route/payrollRoute');
const loanRoutes = require('./route/loanRoute');

const app = express();
const PORT = process.env.PORT || 3000;
const configuredOrigins = process.env.CORS_ORIGIN
    ? process.env.CORS_ORIGIN.split(',').map(origin => origin.trim()).filter(Boolean)
    : [];

app.use(express.json({
    verify: (req, _res, buffer) => {
        req.rawBody = Buffer.from(buffer);
    }
}));
app.use(cors({
    origin: (requestOrigin, callback) => {
        const localDevelopmentOrigin = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(requestOrigin || '');
        if (!requestOrigin || configuredOrigins.includes(requestOrigin) || localDevelopmentOrigin || /^https:\/\/[a-z0-9-]+\.vercel\.app$/i.test(requestOrigin)) {
            return callback(null, true);
        }

        return callback(new Error('Origin is not allowed by CORS'));
    },
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    optionsSuccessStatus: 204
}));
app.use('/api', userRoutes);
app.use('/api', bankRoutes);
app.use('/api', payrollRoutes);
app.use('/api', loanRoutes);
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