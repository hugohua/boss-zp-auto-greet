import { readFileSync } from 'fs';

const banner = readFileSync('./banner.txt', 'utf-8');

export default {
    input: 'src/index.js',
    output: {
        file: 'dist/boss-zhipin.user.js',
        format: 'iife',
        banner,
        sourcemap: false,
    },
};
