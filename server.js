const express = require('express');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3000;
const DIST = path.join(__dirname, 'dist');

// Serve static files
app.use(express.static(DIST));

// All routes serve index.html — React Router handles the rest
app.get('*', (req, res) => {
  res.sendFile(path.join(DIST, 'index.html'));
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
