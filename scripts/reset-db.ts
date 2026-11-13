import { rebuild } from './db-admin';

await rebuild();
console.log('Database rebuilt: schema, reports and seed data loaded.');
