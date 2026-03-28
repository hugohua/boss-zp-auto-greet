import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';

describe('userscript banner metadata', () => {
    it('should match the top-level chat recommend page for SPA transitions into chat/index', () => {
        const banner = readFileSync(path.join(process.cwd(), 'banner.txt'), 'utf-8');

        expect(banner).toContain('// @match        https://*.zhipin.com/web/chat/recommend');
        expect(banner).toContain('// @match        https://*.zhipin.com/web/chat/index');
    });
});
