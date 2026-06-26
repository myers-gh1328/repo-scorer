import { describe, expect, it } from 'vitest';
import { bandColor } from './types';

describe('bandColor', () => {
	it('maps maintainability bands to score colors', () => {
		expect(bandColor('Durable')).toBe('#27ae60');
		expect(bandColor('Healthy')).toBe('#2ecc71');
		expect(bandColor('Serviceable')).toBe('#f39c12');
		expect(bandColor('Basic')).toBe('#e67e22');
		expect(bandColor('Difficult')).toBe('#e74c3c');
	});
});
