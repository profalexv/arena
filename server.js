const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const port = process.env.PORT || 3000;

app.get('/', (req, res) => {
  res.send('Backend hub is running!');
});

// Dynamically load routes from project folders
const projectsDir = __dirname;
fs.readdirSync(projectsDir).forEach(project => {
  const projectPath = path.join(projectsDir, project);
  if (fs.statSync(projectPath).isDirectory()) {
    const routerPath = path.join(projectPath, `${project}.js`);
    if (fs.existsSync(routerPath)) {
      const router = require(routerPath);
      app.use(`/${project}`, router);
      console.log(`Loaded routes for ${project}`);
    }
  }
});

app.listen(port, () => {
  console.log(`Server is listening on port ${port}`);
});
