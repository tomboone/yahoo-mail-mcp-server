import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
    validateUIDs,
    validateSequenceNumbers,
    hasAttachments,
    flattenFolders
} from '../lib/helpers.js';

describe('validateUIDs', () => {
    test('rejects missing input', () => {
        assert.equal(validateUIDs(undefined), 'uids is required');
        assert.equal(validateUIDs(null), 'uids is required');
    });

    test('rejects non-arrays', () => {
        assert.equal(validateUIDs(42), 'uids must be an array');
        assert.equal(validateUIDs('1,2'), 'uids must be an array');
        assert.equal(validateUIDs({ 0: 1 }), 'uids must be an array');
    });

    test('rejects an empty array', () => {
        assert.equal(validateUIDs([]), 'uids cannot be empty');
    });

    test('requires positive integers', () => {
        const expected = 'uids contains invalid values (must be positive integers)';
        assert.equal(validateUIDs([0]), expected, 'zero is not a valid UID');
        assert.equal(validateUIDs([-1]), expected, 'negatives are not valid UIDs');
        assert.equal(validateUIDs([1.5]), expected, 'floats are not valid UIDs');
        assert.equal(validateUIDs(['1']), expected, 'numeric strings are not coerced');
        assert.equal(validateUIDs([1, null, 3]), expected);
        assert.equal(validateUIDs([1, undefined]), expected);
        assert.equal(validateUIDs([NaN]), expected);
    });

    test('accepts valid UIDs', () => {
        assert.equal(validateUIDs([1]), null);
        assert.equal(validateUIDs([1, 2, 3]), null);
        assert.equal(validateUIDs([99999]), null);
    });
});

describe('validateSequenceNumbers', () => {
    test('rejects missing input', () => {
        assert.equal(validateSequenceNumbers(undefined), 'sequenceNumbers is required');
        assert.equal(validateSequenceNumbers(null), 'sequenceNumbers is required');
    });

    test('rejects non-arrays', () => {
        assert.equal(validateSequenceNumbers(42), 'sequenceNumbers must be an array');
    });

    test('rejects an empty array', () => {
        assert.equal(validateSequenceNumbers([]), 'sequenceNumbers cannot be empty');
    });

    test('rejects non-numeric values', () => {
        const expected = 'sequenceNumbers contains invalid values (must be numbers)';
        assert.equal(validateSequenceNumbers(['1']), expected);
        assert.equal(validateSequenceNumbers([1, null]), expected);
        assert.equal(validateSequenceNumbers([1, undefined]), expected);
    });

    test('is looser than validateUIDs: any number passes', () => {
        // This is the deliberate difference between the two validators — sequence
        // numbers are only checked for numeric type, not for positivity.
        assert.equal(validateSequenceNumbers([0]), null);
        assert.equal(validateSequenceNumbers([-1]), null);
        assert.equal(validateSequenceNumbers([1.5]), null);
        assert.equal(validateSequenceNumbers([1, 2, 3]), null);
    });
});

describe('hasAttachments', () => {
    test('returns false for missing or non-array structures', () => {
        assert.equal(hasAttachments(null), false);
        assert.equal(hasAttachments(undefined), false);
        assert.equal(hasAttachments({ disposition: { type: 'attachment' } }), false);
        assert.equal(hasAttachments([]), false);
    });

    test('detects a top-level attachment part', () => {
        const struct = [
            { type: 'text', subtype: 'plain' },
            { type: 'application', disposition: { type: 'attachment' } }
        ];
        assert.equal(hasAttachments(struct), true);
    });

    test('detects an attachment nested in sub-parts', () => {
        const struct = [
            { type: 'text' },
            [
                { type: 'text', subtype: 'html' },
                [{ type: 'image', disposition: { type: 'attachment' } }]
            ]
        ];
        assert.equal(hasAttachments(struct), true);
    });

    test('ignores inline dispositions', () => {
        const struct = [
            { type: 'text', subtype: 'plain' },
            { type: 'image', disposition: { type: 'inline' } }
        ];
        assert.equal(hasAttachments(struct), false);
    });

    test('tolerates null parts', () => {
        assert.equal(hasAttachments([null, undefined]), false);
    });
});

describe('flattenFolders', () => {
    test('returns an empty list for no folders', () => {
        assert.deepEqual(flattenFolders({}), []);
    });

    test('flattens a single folder with defaults applied', () => {
        const result = flattenFolders({ INBOX: {} });
        assert.deepEqual(result, [
            { name: 'INBOX', delimiter: '/', flags: [], selectable: true }
        ]);
    });

    test('joins nested folder names with the parent path', () => {
        const boxes = {
            INBOX: {
                delimiter: '/',
                attribs: [],
                children: {
                    Receipts: { delimiter: '/', attribs: [] }
                }
            }
        };

        const names = flattenFolders(boxes).map(f => f.name);
        assert.deepEqual(names, ['INBOX', 'INBOX/Receipts']);
    });

    test('recurses more than one level deep', () => {
        const boxes = {
            A: { children: { B: { children: { C: {} } } } }
        };

        const names = flattenFolders(boxes).map(f => f.name);
        assert.deepEqual(names, ['A', 'A/B', 'A/B/C']);
    });

    test('marks \\Noselect folders as unselectable but still lists them', () => {
        const boxes = {
            Archive: { attribs: ['\\Noselect'], children: { '2024': {} } }
        };

        const result = flattenFolders(boxes);
        assert.equal(result.length, 2);
        assert.equal(result[0].name, 'Archive');
        assert.equal(result[0].selectable, false);
        assert.equal(result[1].name, 'Archive/2024', 'children of NOSELECT folders are still traversed');
        assert.equal(result[1].selectable, true);
    });

    test('preserves the reported delimiter and flags', () => {
        const boxes = {
            INBOX: { delimiter: '.', attribs: ['\\HasChildren'] }
        };

        const [folder] = flattenFolders(boxes);
        assert.equal(folder.delimiter, '.');
        assert.deepEqual(folder.flags, ['\\HasChildren']);
    });
});
