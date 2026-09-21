const express = require('express');
const app = express();
const PORT = 3000;

app.get('/', (req, res) => {
    res.send('Welcome To Loarn Application!');
});

app.listen(PORT, () => {
    console.log(`Server listening on http://localhost:${PORT}`);
});