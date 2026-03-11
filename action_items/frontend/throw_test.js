const fs = require('fs');
// Let's look for exactly what we render when the connected accounts show
const c = fs.readFileSync('src/pages/DashboardPage.jsx', 'utf8');
console.log(c.match(/<ServiceCard[\s\S]*?\/>/g));
