import { migrate } from '../src/server/db/migrate';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is not set');
migrate(url).then((applied) => console.log(applied.length ? `applied: ${applied.join(', ')}` : 'up to date'));
