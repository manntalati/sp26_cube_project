const fs = require('fs');
const content = fs.readFileSync('src/pages/DashboardPage.jsx', 'utf8');

// We simply want to test clicking the div directly to make sure the route matches and the function gets called
content.replace(/onClick=\{\(\) => navigate\(\`\/review\/\$\{t.id\}\`\)\}/, "onClick={() => { console.log('DIV CLICKED', t.id); navigate(`/review/${t.id}`)}}");
fs.writeFileSync('src/pages/DashboardPage.jsx', content);
