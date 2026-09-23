const path = require('path');
const swaggerJSDoc = require('swagger-jsdoc');

const swaggerDefinition = {
    openapi: '3.0.0',
    info: {
        title: 'Loan Application API',
        version: '1.0.0',
        description: 'API documentation for the Loarn Application'
    },
    servers: [
        {
            url: process.env.API_URL || 'http://localhost:3000'
        }
    ],
    components: {
        securitySchemes: {
            bearerAuth: {
                type: 'http',
                scheme: 'bearer',
                bearerFormat: 'JWT'
            }
        },
        schemas: {
            CreateUserRequest: {
                type: 'object',
                required: ['name', 'email', 'password'],
                properties: {
                    name: { type: 'string', example: 'Jane Doe' },
                    email: { type: 'string', format: 'email', example: 'jane@example.com' },
                    password: { type: 'string', format: 'password', minLength: 8, example: 'StrongPassword123' },
                    role: { type: 'string', enum: ['user', 'admin', 'employee'], default: 'user' }
                }
            },
            OtpOnlyRequest: {
                type: 'object',
                required: ['otp'],
                properties: {
                    otp: { type: 'string', minLength: 6, maxLength: 6, example: '123456' }
                },
                example: {
                    otp: '123456'
                }
            },
            LoginRequest: {
                type: 'object',
                required: ['email', 'password'],
                properties: {
                    email: { type: 'string', format: 'email', example: 'jane@example.com' },
                    password: { type: 'string', format: 'password', minLength: 8, example: 'StrongPassword123' }
                }
            },
            UpdateProfileRequest: {
                type: 'object',
                properties: {
                    name: { type: 'string', example: 'Jane Doe' },
                    email: { type: 'string', format: 'email', example: 'jane.new@example.com' },
                    password: { type: 'string', format: 'password', minLength: 8, example: 'NewPassword123' }
                }
            },
            TokenResponse: {
                type: 'object',
                properties: {
                    message: { type: 'string', example: 'Email verified successfully' },
                    token: { type: 'string', example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...' }
                }
            },
            VerificationResponse: {
                type: 'object',
                properties: {
                    message: { type: 'string', example: 'Email verified successfully' }
                }
            },
            UserCreatedResponse: {
                type: 'object',
                properties: {
                    message: { type: 'string', example: 'User created successfully' },
                    user: {
                        type: 'object',
                        properties: {
                            _id: { type: 'string', example: '65f1a7b2c8d9e00123456789' },
                            name: { type: 'string', example: 'Jane Doe' },
                            email: { type: 'string', format: 'email', example: 'jane@example.com' },
                            role: { type: 'string', example: 'user' },
                            createdAt: { type: 'string', format: 'date-time' }
                        }
                    }
                }
            }
        }
    }
};

module.exports = swaggerJSDoc({
    definition: swaggerDefinition,
    apis: [path.join(__dirname, '..', 'route', '*.js')]
});