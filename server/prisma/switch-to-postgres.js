const fs = require('fs');
const path = require('path');

const schemaPath = path.join(__dirname, 'schema.prisma');
let schema = fs.readFileSync(schemaPath, 'utf8');

// Replace provider = "sqlite" with provider = "postgresql"
schema = schema.replace(/provider\s*=\s*"sqlite"/, 'provider = "postgresql"');

fs.writeFileSync(schemaPath, schema, 'utf8');
console.log('Prisma schema database provider successfully switched to postgresql.');
